import { PgDialect } from 'drizzle-orm/pg-core';
import type { ClsService } from 'nestjs-cls';
import { describe, expect, it } from 'vitest';
import { expenseCategories } from '../../db/schema';
import type { Actor, RequestContext } from '../context/request-context';
import { OrgScope } from './org-scope';

const actor: Actor = {
  userId: '018f0000-0000-7000-8000-00000000000a',
  organizationId: '018f0000-0000-7000-8000-00000000000b',
  role: 'admin',
  isSuperAdmin: false,
  sessionFamilyId: 'family',
};

function scopeWith(current: Actor | undefined): OrgScope {
  const cls = { get: (key: string) => (key === 'actor' ? current : undefined) };
  return new OrgScope(cls as unknown as ClsService<RequestContext>);
}

describe('OrgScope', () => {
  const dialect = new PgDialect({ casing: 'snake_case' });

  it('filtra por la organización del actor y excluye los borrados', () => {
    const query = dialect.sqlToQuery(scopeWith(actor).where(expenseCategories));
    expect(query.sql).toContain('"organization_id" = $1');
    expect(query.sql).toContain('"deleted_at" is null');
    expect(query.params).toEqual([actor.organizationId]);
  });

  it('al insertar agrega organización y autor', () => {
    expect(scopeWith(actor).forInsert({ name: 'Comercial' })).toEqual({
      name: 'Comercial',
      organizationId: actor.organizationId,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });
  });

  it('al actualizar registra autor y fecha', () => {
    const values = scopeWith(actor).forUpdate({ name: 'Ventas' });
    expect(values).toMatchObject({ name: 'Ventas', updatedBy: actor.userId });
    expect(values.updatedAt).toBeInstanceOf(Date);
  });

  it('el borrado lógico registra quién y cuándo', () => {
    const values = scopeWith(actor).forSoftDelete();
    expect(values.deletedBy).toBe(actor.userId);
    expect(values.deletedAt).toBeInstanceOf(Date);
  });

  it('sin actor en el contexto es un error de programación', () => {
    expect(() => scopeWith(undefined).where(expenseCategories)).toThrow(/organization context/);
    expect(() => scopeWith(undefined).forInsert({})).toThrow(/organization context/);
  });
});
