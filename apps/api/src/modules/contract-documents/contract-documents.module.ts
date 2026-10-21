import { CONTRACT_DOCUMENT_MAX_BYTES, type ContractDocument, ErrorCode } from '@anderp/shared';
import {
  type CallHandler,
  Controller,
  Delete,
  Get,
  HttpCode,
  type ExecutionContext,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { registerConstraintCodes } from '../../shared/errors/pg-error.mapper';
import { DomainError } from '../../shared/errors/domain-error';
import { RequiresModule } from '../auth/http/guards';
import { ContractDocumentsService, type UploadedFile as File } from './contract-documents.service';
import { ObjectStorage } from './object-storage';

registerConstraintCodes({
  contract_documents_type_ck: 'VALIDATION_ERROR',
  contract_documents_size_ck: 'VALIDATION_ERROR',
  contract_documents_sha256_ck: 'VALIDATION_ERROR',
  contract_documents_active_uq: 'CONFLICT',
});

/** Multer (en memoria, su valor por defecto) con tope de 10 MB; su 413 se responde como `422 DOCUMENT_TOO_LARGE` (CA-5). */
@Injectable()
class DocumentUploadInterceptor extends FileInterceptor('file', {
  limits: { fileSize: CONTRACT_DOCUMENT_MAX_BYTES, files: 1 },
}) {
  override async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new DomainError(ErrorCode.DOCUMENT_TOO_LARGE, 422);
      }
      throw error;
    }
  }
}

/** F17: documento del contrato en Supabase Storage. */
@ApiTags('contract-documents')
@RequiresModule('staff_payments')
@Controller('contracts/:id/document')
export class ContractDocumentsController {
  constructor(private readonly documents: ContractDocumentsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(DocumentUploadInterceptor)
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: File | undefined,
  ): Promise<ContractDocument> {
    return this.documents.upload(id, file);
  }

  @Get('url')
  signedUrl(@Param('id', ParseUUIDPipe) id: string): Promise<{ url: string; expiresAt: string }> {
    return this.documents.signedUrl(id);
  }

  @Delete()
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.documents.remove(id);
  }
}

@Module({
  controllers: [ContractDocumentsController],
  providers: [ObjectStorage, ContractDocumentsService],
})
export class ContractDocumentsModule {}
