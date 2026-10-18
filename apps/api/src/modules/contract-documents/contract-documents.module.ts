import { Module } from '@nestjs/common';
import { ObjectStorage } from './object-storage';

/** F17: documento del contrato en Supabase Storage. */
@Module({ providers: [ObjectStorage] })
export class ContractDocumentsModule {}
