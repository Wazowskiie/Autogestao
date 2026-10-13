import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Res,
  UploadedFile, UploadedFiles, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateExpenseDto, CreateInvoiceDto, CreateLinkDto, CreatePendencyDto, ImportInvoiceXmlDto,
  UpdateExpenseDto, UpdatePendencyDto, UpdateRenaveDto, UploadFileDto, UpsertAcquisitionDto, UpsertWebDto,
} from './dto/vehicle-details.dto';
import type { UploadedFileLike } from './storage.service';
import { VehicleDetailsService } from './vehicle-details.service';

const MB = 1024 * 1024;
const id = new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });
const WRITE = ['owner', 'admin', 'seller'] as const;

// Abre o arquivo no navegador (PDF e imagem) ou baixa (os demais)
function sendFile(res: Response, file: { path: string; name: string; mimeType: string | null }) {
  const type = file.mimeType ?? 'application/octet-stream';
  const inline = type === 'application/pdf' || type.startsWith('image/');
  res.setHeader('Content-Type', type);
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
  );
  res.sendFile(file.path);
}

@Controller('vehicles/:vehicleId')
export class VehicleDetailsController {
  constructor(private readonly service: VehicleDetailsService) {}

  // ---------- Mídias ----------
  @Roles(...WRITE)
  @Post('photos')
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: 10 * MB } }))
  addPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId', id) vehicleId: string,
    @UploadedFiles() files: UploadedFileLike[],
  ) {
    return this.service.addPhotos(user.dealershipId, vehicleId, files);
  }

  @Roles(...WRITE)
  @Patch('photos/:photoId/cover')
  setCover(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Param('photoId', id) photoId: string) {
    return this.service.setCover(user.dealershipId, vehicleId, photoId);
  }

  @Roles(...WRITE)
  @Delete('photos/:photoId')
  deletePhoto(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Param('photoId', id) photoId: string) {
    return this.service.deletePhoto(user.dealershipId, vehicleId, photoId);
  }

  // ---------- Arquivos ----------
  @Get('files')
  listFiles(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string) {
    return this.service.listFiles(user.dealershipId, vehicleId);
  }

  @Roles(...WRITE)
  @Post('files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * MB } }))
  uploadFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId', id) vehicleId: string,
    @UploadedFile() file: UploadedFileLike,
    @Body() dto: UploadFileDto,
  ) {
    return this.service.uploadFile(user.dealershipId, vehicleId, user.userId, file, dto);
  }

  @Roles(...WRITE)
  @Post('links')
  addLink(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Body() dto: CreateLinkDto) {
    return this.service.addLink(user.dealershipId, vehicleId, user.userId, dto);
  }

  @Get('files/:fileId/download')
  async downloadFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId', id) vehicleId: string,
    @Param('fileId', id) fileId: string,
    @Res() res: Response,
  ) {
    sendFile(res, await this.service.fileForDownload(user.dealershipId, vehicleId, fileId));
  }

  @Roles(...WRITE)
  @Delete('files/:fileId')
  deleteFile(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Param('fileId', id) fileId: string) {
    return this.service.deleteFile(user.dealershipId, vehicleId, fileId);
  }

  // ---------- NF-e ----------
  @Get('invoices')
  listInvoices(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string) {
    return this.service.listInvoices(user.dealershipId, vehicleId);
  }

  @Roles(...WRITE)
  @Post('invoices')
  createInvoice(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Body() dto: CreateInvoiceDto) {
    return this.service.createInvoice(user.dealershipId, vehicleId, dto);
  }

  @Roles(...WRITE)
  @Post('invoices/xml')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * MB } }))
  importXml(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId', id) vehicleId: string,
    @UploadedFile() file: UploadedFileLike,
    @Body() dto: ImportInvoiceXmlDto,
  ) {
    return this.service.importInvoiceXml(user.dealershipId, vehicleId, file, dto.direction);
  }

  @Get('invoices/:invoiceId/xml')
  async invoiceXml(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId', id) vehicleId: string,
    @Param('invoiceId', id) invoiceId: string,
    @Res() res: Response,
  ) {
    sendFile(res, await this.service.invoiceXml(user.dealershipId, vehicleId, invoiceId));
  }

  @Roles('owner', 'admin')
  @Delete('invoices/:invoiceId')
  deleteInvoice(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Param('invoiceId', id) invoiceId: string) {
    return this.service.deleteInvoice(user.dealershipId, vehicleId, invoiceId);
  }

  // ---------- RENAVE ----------
  @Get('renave')
  getRenave(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string) {
    return this.service.getRenave(user.dealershipId, vehicleId);
  }

  @Roles(...WRITE)
  @Put('renave')
  updateRenave(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Body() dto: UpdateRenaveDto) {
    return this.service.updateRenave(user.dealershipId, vehicleId, dto);
  }

  // ---------- Lançamentos ----------
  @Get('expenses')
  listExpenses(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string) {
    return this.service.listExpenses(user.dealershipId, vehicleId);
  }

  @Roles(...WRITE)
  @Post('expenses')
  createExpense(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Body() dto: CreateExpenseDto) {
    return this.service.createExpense(user.dealershipId, vehicleId, user.userId, dto);
  }

  @Roles(...WRITE)
  @Patch('expenses/:expenseId')
  updateExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId', id) vehicleId: string,
    @Param('expenseId', id) expenseId: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.service.updateExpense(user.dealershipId, vehicleId, expenseId, dto);
  }

  @Roles('owner', 'admin')
  @Post('expenses/:expenseId/approve')
  approveBudget(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Param('expenseId', id) expenseId: string) {
    return this.service.approveBudget(user.dealershipId, vehicleId, expenseId);
  }

  @Roles('owner', 'admin')
  @Delete('expenses/:expenseId')
  deleteExpense(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Param('expenseId', id) expenseId: string) {
    return this.service.deleteExpense(user.dealershipId, vehicleId, expenseId);
  }

  // ---------- Entrada ----------
  @Get('acquisition')
  getAcquisition(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string) {
    return this.service.getAcquisition(user.dealershipId, vehicleId);
  }

  @Roles('owner', 'admin')
  @Put('acquisition')
  upsertAcquisition(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Body() dto: UpsertAcquisitionDto) {
    return this.service.upsertAcquisition(user.dealershipId, vehicleId, dto);
  }

  // ---------- Pendências ----------
  @Get('pendencies')
  listPendencies(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string) {
    return this.service.listPendencies(user.dealershipId, vehicleId);
  }

  @Roles(...WRITE)
  @Post('pendencies')
  createPendency(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Body() dto: CreatePendencyDto) {
    return this.service.createPendency(user.dealershipId, vehicleId, dto);
  }

  @Roles(...WRITE)
  @Patch('pendencies/:pendencyId')
  updatePendency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId', id) vehicleId: string,
    @Param('pendencyId', id) pendencyId: string,
    @Body() dto: UpdatePendencyDto,
  ) {
    return this.service.updatePendency(user.dealershipId, vehicleId, pendencyId, dto);
  }

  @Roles(...WRITE)
  @Delete('pendencies/:pendencyId')
  deletePendency(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Param('pendencyId', id) pendencyId: string) {
    return this.service.deletePendency(user.dealershipId, vehicleId, pendencyId);
  }

  // ---------- Web ----------
  @Get('web')
  getWeb(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string) {
    return this.service.getWeb(user.dealershipId, vehicleId);
  }

  @Roles(...WRITE)
  @Put('web')
  upsertWeb(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string, @Body() dto: UpsertWebDto) {
    return this.service.upsertWeb(user.dealershipId, vehicleId, dto);
  }

  // ---------- Financeiro e Resumo ----------
  @Get('financial')
  listFinancial(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string) {
    return this.service.listFinancial(user.dealershipId, vehicleId);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser, @Param('vehicleId', id) vehicleId: string) {
    return this.service.summary(user.dealershipId, vehicleId);
  }
}