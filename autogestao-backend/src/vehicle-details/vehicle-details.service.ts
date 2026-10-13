import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateExpenseDto, CreateInvoiceDto, CreateLinkDto, CreatePendencyDto, UpdateExpenseDto,
  UpdatePendencyDto, UpdateRenaveDto, UploadFileDto, UpsertAcquisitionDto, UpsertWebDto,
} from './dto/vehicle-details.dto';
import { parseNfeXml } from './nfe-xml.parser';
import { StorageService, UploadedFileLike } from './storage.service';

type Tx = Prisma.TransactionClient;

const num = (v: Prisma.Decimal | number | string | null | undefined) => Number(v ?? 0);
const toDate = (v?: string | null) => (v ? new Date(v) : undefined);

@Injectable()
export class VehicleDetailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ================= Base =================

  /** Garante que o veículo existe e é desta revenda */
  private async vehicle(dealershipId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, dealershipId } });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado');
    return vehicle;
  }

  private label(v: { brand: string; model: string; color: string | null; year: number; plate: string | null }) {
    return [v.brand, v.model, v.color, v.year, v.plate].filter(Boolean).join(' ').toUpperCase();
  }

  private async userName(userId?: string) {
    if (!userId) return null;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    return user?.name ?? null;
  }

  // ================= Mídias (fotos) =================

  async addPhotos(dealershipId: string, vehicleId: string, files: UploadedFileLike[]) {
    await this.vehicle(dealershipId, vehicleId);
    if (!files?.length) throw new BadRequestException('Nenhuma foto enviada.');
    files.forEach((f) => this.storage.assertImage(f));

    const last = await this.prisma.vehiclePhoto.findFirst({
      where: { vehicleId }, orderBy: { order: 'desc' }, select: { order: true },
    });
    let order = last ? last.order + 1 : 0;

    for (const file of files) {
      const { url } = await this.storage.savePublic(`${dealershipId}/${vehicleId}`, file);
      await this.prisma.vehiclePhoto.create({ data: { vehicleId, url, order: order++ } });
    }
    return this.listPhotos(vehicleId);
  }

  async deletePhoto(dealershipId: string, vehicleId: string, photoId: string) {
    await this.vehicle(dealershipId, vehicleId);
    const photo = await this.prisma.vehiclePhoto.findFirst({ where: { id: photoId, vehicleId } });
    if (!photo) throw new NotFoundException('Foto não encontrada');
    await this.prisma.vehiclePhoto.delete({ where: { id: photoId } });
    await this.storage.removePublicByUrl(photo.url);
    await this.reorderPhotos(vehicleId);
    return this.listPhotos(vehicleId);
  }

  /** Coloca a foto escolhida como capa (primeira) */
  async setCover(dealershipId: string, vehicleId: string, photoId: string) {
    await this.vehicle(dealershipId, vehicleId);
    const photos = await this.listPhotos(vehicleId);
    if (!photos.some((p) => p.id === photoId)) throw new NotFoundException('Foto não encontrada');
    const ordered = [photos.find((p) => p.id === photoId)!, ...photos.filter((p) => p.id !== photoId)];
    await this.prisma.$transaction(
      ordered.map((p, i) => this.prisma.vehiclePhoto.update({ where: { id: p.id }, data: { order: i } })),
    );
    return this.listPhotos(vehicleId);
  }

  private listPhotos(vehicleId: string) {
    return this.prisma.vehiclePhoto.findMany({ where: { vehicleId }, orderBy: { order: 'asc' } });
  }

  private async reorderPhotos(vehicleId: string) {
    const photos = await this.listPhotos(vehicleId);
    await this.prisma.$transaction(
      photos.map((p, i) => this.prisma.vehiclePhoto.update({ where: { id: p.id }, data: { order: i } })),
    );
  }

  // ================= Arquivos =================

  async listFiles(dealershipId: string, vehicleId: string) {
    await this.vehicle(dealershipId, vehicleId);
    const files = await this.prisma.vehicleFile.findMany({ where: { vehicleId }, orderBy: { createdAt: 'desc' } });
    return files.map(({ storageKey, ...f }) => ({ ...f, downloadable: !!storageKey }));
  }

  async uploadFile(dealershipId: string, vehicleId: string, userId: string, file: UploadedFileLike, dto: UploadFileDto) {
    await this.vehicle(dealershipId, vehicleId);
    this.storage.assertDocument(file);
    const storageKey = await this.storage.savePrivate(`${dealershipId}/${vehicleId}`, file);
    await this.prisma.vehicleFile.create({
      data: {
        dealershipId, vehicleId,
        category: dto.category,
        name: dto.name?.trim() || file.originalname,
        storageKey, mimeType: file.mimetype, size: file.size,
        uploadedBy: await this.userName(userId),
      },
    });
    return this.listFiles(dealershipId, vehicleId);
  }

  async addLink(dealershipId: string, vehicleId: string, userId: string, dto: CreateLinkDto) {
    await this.vehicle(dealershipId, vehicleId);
    await this.prisma.vehicleFile.create({
      data: {
        dealershipId, vehicleId, category: 'link',
        name: dto.name.trim(), url: dto.url.trim(),
        uploadedBy: await this.userName(userId),
      },
    });
    return this.listFiles(dealershipId, vehicleId);
  }

  async fileForDownload(dealershipId: string, vehicleId: string, fileId: string) {
    await this.vehicle(dealershipId, vehicleId);
    const file = await this.prisma.vehicleFile.findFirst({ where: { id: fileId, vehicleId } });
    if (!file?.storageKey) throw new NotFoundException('Arquivo não encontrado');
    return { path: this.storage.privatePath(file.storageKey), name: file.name, mimeType: file.mimeType };
  }

  async deleteFile(dealershipId: string, vehicleId: string, fileId: string) {
    await this.vehicle(dealershipId, vehicleId);
    const file = await this.prisma.vehicleFile.findFirst({ where: { id: fileId, vehicleId } });
    if (!file) throw new NotFoundException('Arquivo não encontrado');
    await this.prisma.vehicleFile.delete({ where: { id: fileId } });
    await this.storage.removePrivate(file.storageKey);
    return this.listFiles(dealershipId, vehicleId);
  }

  // ================= NF-e =================

  async listInvoices(dealershipId: string, vehicleId: string) {
    await this.vehicle(dealershipId, vehicleId);
    const invoices = await this.prisma.vehicleInvoice.findMany({
      where: { vehicleId }, orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return invoices.map(({ xmlStorageKey, ...i }) => ({ ...i, hasXml: !!xmlStorageKey }));
  }

  async createInvoice(dealershipId: string, vehicleId: string, dto: CreateInvoiceDto) {
    await this.vehicle(dealershipId, vehicleId);
    const accessKey = dto.accessKey?.replace(/\D/g, '') || null;
    if (accessKey && accessKey.length !== 44) {
      throw new BadRequestException('A chave da NF-e deve ter 44 números.');
    }
    await this.prisma.vehicleInvoice.create({
      data: {
        dealershipId, vehicleId,
        direction: dto.direction,
        number: dto.number ?? null, series: dto.series ?? null, accessKey,
        operation: dto.operation ?? null, cfop: dto.cfop ?? null, type: dto.type ?? null,
        status: dto.status ?? 'authorized',
        issuerName: dto.issuerName ?? null, issuerDocument: dto.issuerDocument ?? null,
        recipientName: dto.recipientName ?? null, recipientDocument: dto.recipientDocument ?? null,
        amount: dto.amount ?? null, issuedAt: toDate(dto.issuedAt) ?? null,
      },
    });
    return this.listInvoices(dealershipId, vehicleId);
  }

  async importInvoiceXml(dealershipId: string, vehicleId: string, file: UploadedFileLike, direction: 'issued' | 'received') {
    await this.vehicle(dealershipId, vehicleId);
    if (!file) throw new BadRequestException('Envie o arquivo XML da nota.');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('O XML passa de 5 MB.');

    let parsed;
    try {
      parsed = parseNfeXml(file.buffer.toString('utf8'));
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Não foi possível ler o XML.');
    }

    if (parsed.accessKey) {
      const exists = await this.prisma.vehicleInvoice.findFirst({ where: { vehicleId, accessKey: parsed.accessKey } });
      if (exists) throw new BadRequestException('Essa nota já está cadastrada neste veículo.');
    }

    const xmlStorageKey = await this.storage.savePrivate(`${dealershipId}/${vehicleId}/nfe`, {
      ...file, originalname: `${parsed.accessKey ?? 'nfe'}.xml`,
    });
    await this.prisma.vehicleInvoice.create({
      data: { dealershipId, vehicleId, direction, ...parsed, xmlStorageKey },
    });
    return this.listInvoices(dealershipId, vehicleId);
  }

  async invoiceXml(dealershipId: string, vehicleId: string, invoiceId: string) {
    await this.vehicle(dealershipId, vehicleId);
    const invoice = await this.prisma.vehicleInvoice.findFirst({ where: { id: invoiceId, vehicleId } });
    if (!invoice?.xmlStorageKey) throw new NotFoundException('Esta nota não tem XML salvo.');
    return {
      path: this.storage.privatePath(invoice.xmlStorageKey),
      name: `NFe-${invoice.number ?? invoice.accessKey ?? invoice.id}.xml`,
      mimeType: 'application/xml',
    };
  }

  async deleteInvoice(dealershipId: string, vehicleId: string, invoiceId: string) {
    await this.vehicle(dealershipId, vehicleId);
    const invoice = await this.prisma.vehicleInvoice.findFirst({ where: { id: invoiceId, vehicleId } });
    if (!invoice) throw new NotFoundException('Nota não encontrada');
    await this.prisma.vehicleInvoice.delete({ where: { id: invoiceId } });
    await this.storage.removePrivate(invoice.xmlStorageKey);
    return this.listInvoices(dealershipId, vehicleId);
  }

  // ================= RENAVE =================

  async getRenave(dealershipId: string, vehicleId: string) {
    await this.vehicle(dealershipId, vehicleId);
    const [integration, record] = await Promise.all([
      this.prisma.renaveIntegration.findUnique({
        where: { dealershipId }, select: { partner: true, status: true, active: true },
      }),
      this.prisma.vehicleRenave.findUnique({ where: { vehicleId } }),
    ]);
    return { integration, record };
  }

  async updateRenave(dealershipId: string, vehicleId: string, dto: UpdateRenaveDto) {
    await this.vehicle(dealershipId, vehicleId);
    const data = {
      entryStatus: dto.entryStatus, entryAt: toDate(dto.entryAt), entryProtocol: dto.entryProtocol,
      exitStatus: dto.exitStatus, exitAt: toDate(dto.exitAt), exitProtocol: dto.exitProtocol,
      notes: dto.notes,
    };
    await this.prisma.vehicleRenave.upsert({
      where: { vehicleId },
      create: { dealershipId, vehicleId, ...data },
      update: data,
    });
    return this.getRenave(dealershipId, vehicleId);
  }

  // ================= Lançamentos =================

  async listExpenses(dealershipId: string, vehicleId: string) {
    await this.vehicle(dealershipId, vehicleId);
    const items = await this.prisma.vehicleExpense.findMany({
      where: { vehicleId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const entries = items.filter((e) => e.kind !== 'budget');
    const sum = (list: typeof items) => list.reduce((acc, e) => acc + num(e.amount), 0);
    const expenses = entries.filter((e) => e.kind === 'expense');
    const revenues = entries.filter((e) => e.kind === 'revenue');

    return {
      budgets: items.filter((e) => e.kind === 'budget'),
      entries,
      totals: {
        expenses: sum(expenses),
        revenues: sum(revenues),
        addedToCost: sum(expenses.filter((e) => e.addToCost)),
        balance: sum(revenues) - sum(expenses),
      },
    };
  }

  async createExpense(dealershipId: string, vehicleId: string, userId: string, dto: CreateExpenseDto) {
    const vehicle = await this.vehicle(dealershipId, vehicleId);
    const createdByName = await this.userName(userId);
    const date = toDate(dto.date) ?? new Date();
    const status = dto.kind === 'budget' ? 'pending' : dto.status ?? 'pending';

    await this.prisma.$transaction(async (tx) => {
      const financialTransactionId =
        dto.kind === 'budget'
          ? null
          : await this.createFinancial(tx, dealershipId, vehicleId, {
              type: dto.kind === 'revenue' ? 'revenue' : 'expense',
              amount: dto.amount, date, paid: status === 'paid',
              description: `${dto.description} - ${this.label(vehicle)}`,
            });

      await tx.vehicleExpense.create({
        data: {
          dealershipId, vehicleId, kind: dto.kind, date,
          description: dto.description.trim(),
          supplier: dto.supplier ?? null, requester: dto.requester ?? null,
          amount: dto.amount, status,
          addToCost: dto.kind === 'expense' ? dto.addToCost ?? true : false,
          financialTransactionId, createdByName,
        },
      });
    });
    return this.listExpenses(dealershipId, vehicleId);
  }

  async updateExpense(dealershipId: string, vehicleId: string, expenseId: string, dto: UpdateExpenseDto) {
    const vehicle = await this.vehicle(dealershipId, vehicleId);
    const current = await this.prisma.vehicleExpense.findFirst({ where: { id: expenseId, vehicleId } });
    if (!current) throw new NotFoundException('Lançamento não encontrado');

    const isBudget = current.kind === 'budget';
    if (dto.status && isBudget && !['pending', 'approved', 'rejected'].includes(dto.status)) {
      throw new BadRequestException('Orçamento só pode ficar pendente, aprovado ou recusado.');
    }
    if (dto.status && !isBudget && !['pending', 'paid'].includes(dto.status)) {
      throw new BadRequestException('Lançamento só pode ficar pendente ou pago.');
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.vehicleExpense.update({
        where: { id: expenseId },
        data: {
          description: dto.description?.trim(), amount: dto.amount, date: toDate(dto.date),
          supplier: dto.supplier, requester: dto.requester, status: dto.status,
          addToCost: isBudget ? undefined : dto.addToCost,
        },
      });

      // Mantém o lançamento do Financeiro igual a este
      if (updated.financialTransactionId) {
        await tx.financialTransaction.updateMany({
          where: { id: updated.financialTransactionId, dealershipId },
          data: {
            amount: updated.amount, date: updated.date,
            description: `${updated.description} - ${this.label(vehicle)}`,
            paid: updated.status === 'paid',
            paidAt: updated.status === 'paid' ? new Date() : null,
          },
        });
      }
    });
    return this.listExpenses(dealershipId, vehicleId);
  }

  /** Orçamento aprovado vira uma despesa do veículo (e entra no Financeiro) */
  async approveBudget(dealershipId: string, vehicleId: string, expenseId: string) {
    const vehicle = await this.vehicle(dealershipId, vehicleId);
    const budget = await this.prisma.vehicleExpense.findFirst({ where: { id: expenseId, vehicleId, kind: 'budget' } });
    if (!budget) throw new NotFoundException('Orçamento não encontrado');
    if (budget.status === 'approved') throw new BadRequestException('Este orçamento já foi aprovado.');

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleExpense.update({ where: { id: budget.id }, data: { status: 'approved' } });
      const financialTransactionId = await this.createFinancial(tx, dealershipId, vehicleId, {
        type: 'expense', amount: num(budget.amount), date: new Date(), paid: false,
        description: `${budget.description} - ${this.label(vehicle)}`,
      });
      await tx.vehicleExpense.create({
        data: {
          dealershipId, vehicleId, kind: 'expense', date: new Date(),
          description: budget.description, supplier: budget.supplier, requester: budget.requester,
          amount: budget.amount, status: 'pending', addToCost: true,
          financialTransactionId, createdByName: budget.createdByName,
        },
      });
    });
    return this.listExpenses(dealershipId, vehicleId);
  }

  async deleteExpense(dealershipId: string, vehicleId: string, expenseId: string) {
    await this.vehicle(dealershipId, vehicleId);
    const expense = await this.prisma.vehicleExpense.findFirst({ where: { id: expenseId, vehicleId } });
    if (!expense) throw new NotFoundException('Lançamento não encontrado');
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleExpense.delete({ where: { id: expenseId } });
      if (expense.financialTransactionId) {
        await tx.financialTransaction.deleteMany({ where: { id: expense.financialTransactionId, dealershipId } });
      }
    });
    return this.listExpenses(dealershipId, vehicleId);
  }

  private async createFinancial(
    tx: Tx, dealershipId: string, vehicleId: string,
    d: { type: 'expense' | 'revenue'; amount: number; date: Date; paid: boolean; description: string; category?: string },
  ) {
    const created = await tx.financialTransaction.create({
      data: {
        dealershipId, vehicleId, type: d.type,
        category: d.category ?? (d.type === 'expense' ? 'Despesa de veículo' : 'Receita de veículo'),
        amount: d.amount, date: d.date, description: d.description,
        paid: d.paid, paidAt: d.paid ? new Date() : null,
      },
    });
    return created.id;
  }

  // ================= Entrada =================

  async getAcquisition(dealershipId: string, vehicleId: string) {
    await this.vehicle(dealershipId, vehicleId);
    return this.prisma.vehicleAcquisition.findUnique({ where: { vehicleId } });
  }

  async upsertAcquisition(dealershipId: string, vehicleId: string, dto: UpsertAcquisitionDto) {
    const vehicle = await this.vehicle(dealershipId, vehicleId);
    const current = await this.prisma.vehicleAcquisition.findUnique({ where: { vehicleId } });

    const ownershipType = dto.ownershipType ?? current?.ownershipType ?? 'own';
    const purchaseValue = dto.purchaseValue ?? num(current?.purchaseValue);
    const entryDate = toDate(dto.entryDate) ?? current?.entryDate ?? vehicle.createdAt;

    await this.prisma.$transaction(async (tx) => {
      // "Compra" no Financeiro: só para veículo próprio com valor de compra
      let financialTransactionId = current?.financialTransactionId ?? null;
      const shouldHaveFinancial = ownershipType === 'own' && purchaseValue > 0;
      const description = `Entrada no estoque - ${this.label(vehicle)}`;

      if (shouldHaveFinancial && financialTransactionId) {
        await tx.financialTransaction.updateMany({
          where: { id: financialTransactionId, dealershipId },
          data: { amount: purchaseValue, date: entryDate, description },
        });
      } else if (shouldHaveFinancial) {
        financialTransactionId = await this.createFinancial(tx, dealershipId, vehicleId, {
          type: 'expense', category: 'Compra de veículo', amount: purchaseValue,
          date: entryDate, paid: true, description,
        });
      } else if (financialTransactionId) {
        await tx.financialTransaction.deleteMany({ where: { id: financialTransactionId, dealershipId } });
        financialTransactionId = null;
      }

      const data = {
        entryDate, ownershipType,
        supplierName: dto.supplierName, supplierDocument: dto.supplierDocument,
        supplierPhone: dto.supplierPhone,
        documentOwnerName: dto.documentOwnerName, documentOwnerDocument: dto.documentOwnerDocument,
        purchaseValue, payoffValue: dto.payoffValue, debtsValue: dto.debtsValue,
        notes: dto.notes, financialTransactionId,
      };
      await tx.vehicleAcquisition.upsert({
        where: { vehicleId },
        create: { dealershipId, vehicleId, ...data },
        update: data,
      });

      // O valor de compra é o custo do veículo no estoque
      if (ownershipType === 'own' && purchaseValue > 0 && purchaseValue !== num(vehicle.cost)) {
        await tx.vehicle.update({ where: { id: vehicleId }, data: { cost: purchaseValue } });
      }
    });
    return this.getAcquisition(dealershipId, vehicleId);
  }

  // ================= Pendências =================

  async listPendencies(dealershipId: string, vehicleId: string) {
    await this.vehicle(dealershipId, vehicleId);
    return this.prisma.vehiclePendency.findMany({
      where: { vehicleId }, orderBy: [{ done: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createPendency(dealershipId: string, vehicleId: string, dto: CreatePendencyDto) {
    await this.vehicle(dealershipId, vehicleId);
    await this.prisma.vehiclePendency.create({
      data: { dealershipId, vehicleId, description: dto.description.trim() },
    });
    return this.listPendencies(dealershipId, vehicleId);
  }

  async updatePendency(dealershipId: string, vehicleId: string, pendencyId: string, dto: UpdatePendencyDto) {
    await this.vehicle(dealershipId, vehicleId);
    const found = await this.prisma.vehiclePendency.findFirst({ where: { id: pendencyId, vehicleId } });
    if (!found) throw new NotFoundException('Pendência não encontrada');
    await this.prisma.vehiclePendency.update({
      where: { id: pendencyId },
      data: {
        description: dto.description?.trim(),
        done: dto.done,
        doneAt: dto.done === undefined ? undefined : dto.done ? new Date() : null,
      },
    });
    return this.listPendencies(dealershipId, vehicleId);
  }

  async deletePendency(dealershipId: string, vehicleId: string, pendencyId: string) {
    await this.vehicle(dealershipId, vehicleId);
    await this.prisma.vehiclePendency.deleteMany({ where: { id: pendencyId, vehicleId } });
    return this.listPendencies(dealershipId, vehicleId);
  }

  // ================= Web =================

  async getWeb(dealershipId: string, vehicleId: string) {
    const vehicle = await this.vehicle(dealershipId, vehicleId);
    const web = await this.prisma.vehicleWeb.findUnique({ where: { vehicleId } });
    return {
      web,
      defaultTitle: [vehicle.brand, vehicle.model, vehicle.version, vehicle.year].filter(Boolean).join(' '),
      fipe: await this.fipeFromCache(vehicle.plate),
    };
  }

  async upsertWeb(dealershipId: string, vehicleId: string, dto: UpsertWebDto) {
    await this.vehicle(dealershipId, vehicleId);
    const data = {
      title: dto.title?.trim() || null,
      description: dto.description?.trim() || null,
      webPrice: dto.webPrice ?? null,
      promoPrice: dto.promoPrice ?? null,
      youtubeUrl: dto.youtubeUrl?.trim() || null,
      featured: dto.featured,
      published: dto.published,
    };
    await this.prisma.vehicleWeb.upsert({
      where: { vehicleId },
      create: { dealershipId, vehicleId, ...data },
      update: data,
    });
    return this.getWeb(dealershipId, vehicleId);
  }

  /** Valor FIPE da última consulta de placa (não gasta consulta nova) */
  private async fipeFromCache(plate: string | null) {
    if (!plate) return null;
    const cached = await this.prisma.plateLookup.findUnique({ where: { plate } });
    const data = cached?.data as { fipe?: { dados?: Array<Record<string, any>> } } | undefined;
    const list = Array.isArray(data?.fipe?.dados) ? [...data!.fipe!.dados!] : [];
    const best = list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    if (!best) return null;
    const value = Number(String(best.texto_valor ?? '').replace(/[^\d,]/g, '').replace(',', '.'));
    return {
      code: best.codigo_fipe ?? null,
      label: best.texto_modelo ?? null,
      value: Number.isFinite(value) && value > 0 ? value : null,
      reference: typeof best.mes_referencia === 'string' ? best.mes_referencia.trim() : null,
    };
  }

  // ================= Financeiro =================

  async listFinancial(dealershipId: string, vehicleId: string) {
    await this.vehicle(dealershipId, vehicleId);
    return this.prisma.financialTransaction.findMany({
      where: { dealershipId, OR: [{ vehicleId }, { sale: { vehicleId } }] },
      orderBy: { date: 'desc' },
    });
  }

  // ================= Resumo =================

  async summary(dealershipId: string, vehicleId: string) {
    const vehicle = await this.vehicle(dealershipId, vehicleId);
    const [expenses, sale, pendingCount, filesCount, photosCount, acquisition] = await Promise.all([
      this.listExpenses(dealershipId, vehicleId),
      this.prisma.sale.findUnique({ where: { vehicleId }, select: { price: true, soldAt: true } }),
      this.prisma.vehiclePendency.count({ where: { vehicleId, done: false } }),
      this.prisma.vehicleFile.count({ where: { vehicleId } }),
      this.prisma.vehiclePhoto.count({ where: { vehicleId } }),
      this.prisma.vehicleAcquisition.findUnique({ where: { vehicleId }, select: { entryDate: true } }),
    ]);

    const purchase = num(vehicle.cost);
    const totalCost = purchase + expenses.totals.addedToCost;
    const price = sale ? num(sale.price) : num(vehicle.price);
    const profit = price - totalCost + expenses.totals.revenues;
    const entryDate = acquisition?.entryDate ?? vehicle.createdAt;
    const endDate = sale?.soldAt ?? new Date();

    return {
      purchase,
      addedToCost: expenses.totals.addedToCost,
      totalCost,
      revenues: expenses.totals.revenues,
      price,
      sold: !!sale,
      profit,
      margin: totalCost > 0 ? (profit / totalCost) * 100 : 0,
      daysInStock: Math.max(0, Math.floor((endDate.getTime() - entryDate.getTime()) / 86_400_000)),
      pendingCount,
      filesCount,
      photosCount,
    };
  }
}