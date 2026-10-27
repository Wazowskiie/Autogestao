// WhatsApp e redes sociais da loja. A pessoa pode colar o link ou só o @; guardamos limpo.
import { BadRequestException } from '@nestjs/common';

export interface SocialLinks {
  whatsapp?: string | null;   // só números, com DDD (ex: 85999998888)
  instagram?: string | null;  // usuário sem @
  facebook?: string | null;   // usuário ou caminho da página (ex: chronosauto ou profile.php?id=123)
  tiktok?: string | null;     // usuário sem @
  youtube?: string | null;    // @canal ou caminho
  website?: string | null;    // https://...
}
export const SOCIAL_KEYS: (keyof SocialLinks)[] = ['whatsapp', 'instagram', 'facebook', 'tiktok', 'youtube', 'website'];

const HOSTS: Record<string, RegExp> = {
  instagram: /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\//i,
  facebook: /^(?:https?:\/\/)?(?:www\.|m\.|web\.|pt-br\.)?(?:facebook|fb)\.com\//i,
  tiktok: /^(?:https?:\/\/)?(?:www\.|m\.)?tiktok\.com\//i,
  youtube: /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\//i,
};
const LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };

function handle(kind: 'instagram' | 'facebook' | 'tiktok' | 'youtube', raw: string) {
  let v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || /\.(com|br)\//i.test(v)) {
    if (!HOSTS[kind].test(v)) throw new BadRequestException(`O link do ${LABEL[kind]} não parece ser do ${LABEL[kind]}.`);
    v = v.replace(HOSTS[kind], '');
  }
  if (kind === 'facebook' && /^profile\.php\?id=\d+/i.test(v)) return v.match(/^profile\.php\?id=\d+/i)![0];
  v = v.split(/[?#]/)[0].replace(/\/+$/, '');
  if (kind === 'tiktok' || kind === 'instagram') v = v.replace(/^@/, '').split('/')[0];
  if (kind === 'youtube' && !v.startsWith('@') && !/^(c|channel|user)\//.test(v)) v = `@${v.replace(/^@/, '')}`;
  if (!/^[A-Za-z0-9._@\-/=]{1,100}$/.test(v)) throw new BadRequestException(`Usuário do ${LABEL[kind]} inválido.`);
  return v;
}

export function normalizeSocialLinks(input: Record<string, unknown>): SocialLinks {
  const out: SocialLinks = {};
  for (const key of SOCIAL_KEYS) {
    const raw = input[key];
    if (raw === undefined) continue;
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (!text) { out[key] = null; continue; }
    if (key === 'whatsapp') {
      let d = text.replace(/\D/g, '');
      if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
      if (d.length < 10 || d.length > 11) throw new BadRequestException('WhatsApp da loja inválido. Use DDD + número, ex: (85) 99999-8888.');
      out.whatsapp = d;
    } else if (key === 'website') {
      const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
      try { const u = new URL(url); if (!u.hostname.includes('.')) throw new Error(); out.website = u.toString().replace(/\/$/, ''); }
      catch { throw new BadRequestException('Endereço do site inválido.'); }
    } else {
      out[key] = handle(key, text);
    }
  }
  return out;
}

/** Links prontos para o site e para as mensagens */
export function socialUrls(links: SocialLinks | null | undefined) {
  const l = links ?? {};
  return {
    whatsapp: l.whatsapp ? `https://wa.me/55${l.whatsapp}` : null,
    instagram: l.instagram ? `https://instagram.com/${l.instagram}` : null,
    facebook: l.facebook ? `https://facebook.com/${l.facebook}` : null,
    tiktok: l.tiktok ? `https://tiktok.com/@${l.tiktok}` : null,
    youtube: l.youtube ? `https://youtube.com/${l.youtube}` : null,
    website: l.website ?? null,
  };
}
