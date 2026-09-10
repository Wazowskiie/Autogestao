-- AlterTable
ALTER TABLE "dealerships" ADD COLUMN     "focus_nfe_ambiente" TEXT NOT NULL DEFAULT 'homologacao',
ADD COLUMN     "focus_nfe_bairro" TEXT,
ADD COLUMN     "focus_nfe_cep" TEXT,
ADD COLUMN     "focus_nfe_inscricao_estadual" TEXT,
ADD COLUMN     "focus_nfe_logradouro" TEXT,
ADD COLUMN     "focus_nfe_municipio" TEXT,
ADD COLUMN     "focus_nfe_numero" TEXT,
ADD COLUMN     "focus_nfe_regime_tributario" INTEGER,
ADD COLUMN     "focus_nfe_token_encrypted" TEXT,
ADD COLUMN     "focus_nfe_uf" TEXT;
