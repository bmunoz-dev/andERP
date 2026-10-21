import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ClsService } from 'nestjs-cls';
import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../../../shared/context/request-context';
import { ModuleGuard, RequiresModule } from './guards';

@RequiresModule('agenda')
class ClassLevel {
  list() {}
}

class MethodLevel {
  @RequiresModule('agenda')
  list() {}
}

function canActivate(target: { prototype: { list: () => void } }, modules: string[]) {
  const cls = { get: () => ({ modules }) } as unknown as ClsService<RequestContext>;
  const context = {
    getHandler: () => target.prototype.list,
    getClass: () => target,
  } as unknown as ExecutionContext;
  return () => new ModuleGuard(new Reflector(), cls).canActivate(context);
}

describe('ModuleGuard (F19 CA-9)', () => {
  it('lee el paquete del controlador y también del método', () => {
    for (const target of [ClassLevel, MethodLevel]) {
      expect(canActivate(target, ['agenda'])()).toBe(true);
      expect(canActivate(target, ['credentials'])).toThrow(
        expect.objectContaining({ code: 'MODULE_DISABLED' }),
      );
    }
  });
});
