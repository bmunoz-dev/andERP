import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Marca una ruta como accesible sin autenticación. El guard global llega en F01. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
