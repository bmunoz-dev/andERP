import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import '../src/modules/auth/auth.module'; // registra las restricciones
import { mapPostgresError } from '../src/shared/errors/pg-error.mapper';
import { resetDb, withOwnerSql } from './setup/reset-db';

type Sql = postgres.Sql;

/** Selector de organización de F20 (design.md §5.3, §6.2). */
describe('F20 selector: base de datos', () => {
  beforeEach(resetDb);

  const insertOrg = (sql: Sql, status = 'active') =>
    sql<{ id: string }[]>`
      insert into anderp.organizations (id, name, tax_id, status)
      values (${randomUUID()}, 'Org', ${randomUUID().slice(0, 18)}, ${status}::anderp.organization_status)
      returning id`.then((r) => r[0]!.id);

  const insertUser = (sql: Sql) =>
    sql<{ id: string }[]>`
      insert into anderp.users (id, email, first_name, last_name)
      values (${randomUUID()}, ${`u-${randomUUID()}@x.co`}, 'Ana', 'Gómez') returning id`.then(
      (r) => r[0]!.id,
    );

  const insertMember = (
    sql: Sql,
    userId: string,
    organizationId: string,
    createdAt: string,
    extra: { active?: boolean } = {},
  ) =>
    sql`insert into anderp.organization_members
      (user_id, organization_id, role, is_active, created_at)
      values (${userId}, ${organizationId}, 'admin', ${extra.active ?? true}, ${createdAt})`;

  const insertSession = (sql: Sql, userId: string, organizationId: string | null) =>
    sql`insert into anderp.sessions (id, user_id, organization_id, family_id, token_hash, expires_at)
      values (${randomUUID()}, ${userId}, ${organizationId}, ${randomUUID()}, ${randomUUID()}, now() + interval '7 days')`;

  it('CA-1: la sesión solo admite una organización de la que el usuario es miembro', async () => {
    await withOwnerSql(async (sql) => {
      const [orgA, orgB, user] = [
        await insertOrg(sql),
        await insertOrg(sql),
        await insertUser(sql),
      ];
      await insertMember(sql, user, orgA, '2026-01-01');

      await insertSession(sql, user, orgA);
      const error = await insertSession(sql, user, orgB).catch((e: unknown) => e);
      expect(error).toMatchObject({ constraint_name: 'sessions_membership_fk' });
      expect(mapPostgresError(error)?.code).toBe('NOT_FOUND');
      await expect(insertSession(sql, user, null)).rejects.toThrow(/not-null/);
    });
  });

  it('CA-2: `last_selected_at` es nula hasta que el usuario elige', async () => {
    await withOwnerSql(async (sql) => {
      const [org, user] = [await insertOrg(sql), await insertUser(sql)];
      await insertMember(sql, user, org, '2026-01-01');
      const [row] = await sql<{ last_selected_at: Date | null }[]>`
        select last_selected_at from anderp.organization_members`;
      expect(row?.last_selected_at).toBeNull();
    });
  });

  it('CA-2: la migración rellena cada sesión con la membresía que usaban hoy', async () => {
    // La base de pruebas se migra vacía, así que se ejecuta el relleno de la migración a mano,
    // sobre sesiones sin organización (se quita el NOT NULL y la FK dentro de una transacción
    // que se revierte al final).
    const dir = path.resolve(__dirname, '../drizzle');
    const file = readdirSync(dir).find((f) => f.startsWith('0035_'));
    const backfill = /UPDATE anderp\.sessions[\s\S]*?DELETE FROM anderp\.sessions[^;]*;/i.exec(
      readFileSync(path.join(dir, file ?? ''), 'utf8'),
    )?.[0];
    expect(backfill).toBeDefined();

    const rollback = new Error('rollback');
    await withOwnerSql(async (sql) => {
      const [oldest, newest, suspended] = [
        await insertOrg(sql),
        await insertOrg(sql),
        await insertOrg(sql, 'suspended'),
      ];
      const [multi, inactiveOnly, orphan] = [
        await insertUser(sql),
        await insertUser(sql),
        await insertUser(sql),
      ];
      // `multi`: la más antigua activa es `oldest`; la inactiva más vieja no cuenta.
      await insertMember(sql, multi, newest, '2026-03-01');
      await insertMember(sql, multi, oldest, '2026-02-01');
      await insertMember(sql, multi, suspended, '2026-01-01', { active: false });
      // `inactiveOnly`: ninguna activa, toma la más antigua sin filtrar.
      await insertMember(sql, inactiveOnly, newest, '2026-03-01', { active: false });
      await insertMember(sql, inactiveOnly, oldest, '2026-02-01', { active: false });

      await sql
        .begin(async (tx) => {
          await tx`alter table anderp.sessions drop constraint sessions_membership_fk`;
          await tx`alter table anderp.sessions alter column organization_id drop not null`;
          await insertSession(tx, multi, null);
          await insertSession(tx, inactiveOnly, null);
          await insertSession(tx, orphan, null); // sin membresía: se borra
          await tx.unsafe(backfill ?? '');
          const rows = await tx<{ user_id: string; organization_id: string }[]>`
            select user_id, organization_id from anderp.sessions`;
          expect(rows).toHaveLength(2);
          expect(rows.find((r) => r.user_id === multi)?.organization_id).toBe(oldest);
          expect(rows.find((r) => r.user_id === inactiveOnly)?.organization_id).toBe(oldest);
          throw rollback;
        })
        .catch((error: unknown) => {
          if (error !== rollback) throw error;
        });
    });
  });
});
