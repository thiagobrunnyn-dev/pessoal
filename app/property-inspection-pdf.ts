/** Browser-only export. Import this module lazily from the explicit PDF button. */
import type {
  InspectionDetail, InspectionEnvironment, InspectionItem, InspectionPhoto,
} from "../lib/property-inspections";
import type { PDFFont, PDFImage, PDFPage } from "pdf-lib";

export type InspectionPdfProgress = {
  stage: "snapshot" | "images" | "rendering" | "ready";
  completed: number;
  total: number;
};
export type InspectionPdfImage = { bytes: Uint8Array; mimeType: "image/jpeg" | "image/png" };
export type InspectionPdfImageReference = { kind: "photo" | "signature"; id: string };
export type InspectionPdfOptions = {
  propertyId: string;
  inspectionId: string;
  version: number;
  signal?: AbortSignal;
  onProgress?: (progress: InspectionPdfProgress) => void;
};
export const INSPECTION_PDF_LIMITS = Object.freeze({
  maxPhotos: 500,
  maxSignatures: 20,
  maxImages: 520,
  maxImageBytes: 10 * 1024 * 1024,
  maxTotalImageBytes: 64 * 1024 * 1024,
  maxImagePixels: 24_000_000,
  maxTotalImagePixels: 600_000_000,
  maxPages: 1200,
  maxSnapshotBytes: 5 * 1024 * 1024,
});

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 44;
const WIDTH = A4[0] - MARGIN * 2;
const BOTTOM = 54;
const CONTENT_TOP = 752;
const TYPE_NAMES = { entry: "Entrada", return: "Devolução", periodic: "Periódica" };
const ID = /^[a-zA-Z0-9_-]{1,80}$/;

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("A geração do PDF foi cancelada.");
}
function dateLabel(value: string | null | undefined) {
  if (!value) return "Não informado";
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return date ? `${date[3]}/${date[2]}/${date[1]}` : value;
}
function timestampLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const local = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Belem", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(date).replace(",", "");
  return `${local} | Belém (UTC-3)`;
}
function displayText(value: string) {
  return value.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, "    ")
    .replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\u00a0/g, " ");
}
function safeFilename(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
export function inspectionPdfFilename(detail: InspectionDetail) {
  const s = detail.inspection;
  return `vistoria-${safeFilename(s.property.name) || "imovel"}-${s.id}-r${s.version}.pdf`;
}

function imageSize(image: InspectionPdfImage): { width: number; height: number } {
  const b = image.bytes;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (image.mimeType === "image/png") {
    if (b.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
      || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) {
      throw new Error("Uma imagem PNG da vistoria está inválida. O PDF não foi gerado.");
    }
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) {
    throw new Error("Uma imagem JPEG da vistoria está inválida. O PDF não foi gerado.");
  }
  let offset = 2;
  while (offset + 3 < b.length) {
    if (b[offset] !== 0xff) break;
    while (b[offset] === 0xff) offset++;
    const marker = b[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > b.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > b.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
      return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
    }
    offset += length;
  }
  throw new Error("Não foi possível ler as dimensões de uma foto. O PDF não foi gerado.");
}

/** No network, DOM, storage, current date or server import. Uses one saved snapshot. */
export async function buildPropertyInspectionPdf(options: {
  detail: InspectionDetail;
  loadImage: (reference: InspectionPdfImageReference) => Promise<InspectionPdfImage>;
  logoImage?: InspectionPdfImage;
  signal?: AbortSignal;
  onProgress?: (progress: InspectionPdfProgress) => void;
}): Promise<{ bytes: Uint8Array; filename: string; pageCount: number; version: number }> {
  const { detail, loadImage, signal, onProgress } = options;
  checkAbort(signal);
  const s = detail.inspection;
  if (!s?.id || !ID.test(s.id) || !Number.isSafeInteger(s.version) || s.version < 1
    || !s.property || !Array.isArray(s.items) || !Array.isArray(s.environments)
    || !Array.isArray(detail.photos) || !Array.isArray(detail.signatures)) {
    throw new Error("Não foi possível confirmar a revisão salva da vistoria.");
  }
  if (s.items.length > 200 || s.environments.length > 100) {
    throw new Error("A vistoria excede os limites de ambientes ou itens do PDF.");
  }
  const imageCount = detail.photos.length + detail.signatures.length;
  if (detail.photos.length > INSPECTION_PDF_LIMITS.maxPhotos || detail.signatures.length > INSPECTION_PDF_LIMITS.maxSignatures) {
    throw new Error(`O PDF aceita até ${INSPECTION_PDF_LIMITS.maxPhotos} fotos e ${INSPECTION_PDF_LIMITS.maxSignatures} assinaturas por revisão. Nenhum PDF parcial foi gerado.`);
  }
  const seenImages = new Set<string>();
  for (const photo of detail.photos) {
    if (!ID.test(photo.id) || !Number.isInteger(photo.version) || photo.version < 1 || photo.version > s.version || seenImages.has(`p:${photo.id}`)) {
      throw new Error("A lista de fotos não corresponde à revisão selecionada. Reabra a vistoria.");
    }
    seenImages.add(`p:${photo.id}`);
  }
  for (const signature of detail.signatures) {
    if (!ID.test(signature.id) || signature.version !== s.version || !signature.actor?.user_id || seenImages.has(`s:${signature.id}`)) {
      throw new Error("Há uma assinatura incompatível com esta revisão. Reabra a vistoria.");
    }
    seenImages.add(`s:${signature.id}`);
  }
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  // Keep the document tied to the saved revision, including its PDF metadata.
  doc.setTitle(`Laudo de vistoria ${s.id} - revisão ${s.version}`);
  doc.setAuthor("Mobiliza Facilities");
  doc.setCreator("Mobiliza - Vistorias de imóveis");
  doc.setProducer("Mobiliza - PDF local");
  const savedAt = new Date(s.updated_at);
  if (!Number.isFinite(savedAt.getTime())) throw new Error("A revisão salva não tem data válida.");
  doc.setCreationDate(savedAt);
  doc.setModificationDate(savedAt);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const colors = {
    ink: rgb(0.11, 0.22, 0.29), muted: rgb(0.36, 0.42, 0.47),
    orange: rgb(0.93, 0.39, 0.10), line: rgb(0.86, 0.89, 0.91),
    pale: rgb(0.97, 0.98, 0.985), white: rgb(1, 1, 1),
  };
  let totalImageBytes = 0;
  let totalImagePixels = 0;
  let completedImages = 0;
  async function embedImage(image: InspectionPdfImage) {
    checkAbort(signal);
    if (!image.bytes.length || image.bytes.length > INSPECTION_PDF_LIMITS.maxImageBytes) {
      throw new Error("Uma imagem excede 10 MB ou está vazia. O PDF completo não foi gerado.");
    }
    totalImageBytes += image.bytes.length;
    if (totalImageBytes > INSPECTION_PDF_LIMITS.maxTotalImageBytes) {
      throw new Error("As imagens excedem o limite de 64 MB para gerar este PDF no navegador. Nenhuma foto foi descartada e nenhum PDF parcial foi baixado.");
    }
    const { width, height } = imageSize(image);
    const pixels = width * height;
    totalImagePixels += pixels;
    if (width < 1 || height < 1 || pixels > INSPECTION_PDF_LIMITS.maxImagePixels
      || totalImagePixels > INSPECTION_PDF_LIMITS.maxTotalImagePixels) {
      throw new Error("A resolução das imagens excede a capacidade deste PDF no navegador (24 megapixels por imagem ou 600 no total). Use fotos com resolução menor ao preparar a vistoria. Nenhum PDF parcial foi gerado.");
    }
    try {
      const result = image.mimeType === "image/png" ? await doc.embedPng(image.bytes) : await doc.embedJpg(image.bytes);
      // Flush each embedder now, releasing its temporary decoded PNG arrays.
      await result.embed();
      return result;
    } catch {
      throw new Error("Uma imagem da vistoria está corrompida ou não é compatível. O PDF completo não foi gerado.");
    }
  }
  const logo = options.logoImage ? await embedImage(options.logoImage) : null;
  async function evidence(reference: InspectionPdfImageReference) {
    const result = await embedImage(await loadImage(reference));
    onProgress?.({ stage: "images", completed: ++completedImages, total: imageCount });
    return result;
  }
  function text(value: string, font = regular) {
    const clean = displayText(value);
    try { font.encodeText(clean.replace(/\n/g, "")); }
    catch {
      const unsupported = [...clean].find(character => {
        if (character === "\n") return false;
        try { font.encodeText(character); return false; } catch { return true; }
      });
      throw new Error(`O texto contém um caractere não compatível com a fonte do PDF${unsupported ? ` (${unsupported})` : ""}. Ajuste esse caractere e salve uma nova revisão antes de baixar.`);
    }
    return clean;
  }
  function wrap(value: string, width: number, size = 10, font: PDFFont = regular): string[] {
    const result: string[] = [];
    for (const paragraph of text(value, font).split("\n")) {
      if (!paragraph.trim()) { result.push(""); continue; }
      let line = "";
      for (const word of paragraph.trim().split(/ +/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
        if (line) { result.push(line); line = ""; }
        if (font.widthOfTextAtSize(word, size) <= width) { line = word; continue; }
        for (const character of word) {
          if (line && font.widthOfTextAtSize(line + character, size) > width) { result.push(line); line = ""; }
          line += character;
        }
      }
      if (line) result.push(line);
    }
    return result;
  }
  let page!: PDFPage;
  let y = CONTENT_TOP;
  let context = "Identificação da vistoria";
  const reportNumber = `VIST-${s.id}`;
  function pageStart() {
    checkAbort(signal);
    if (doc.getPageCount() >= INSPECTION_PDF_LIMITS.maxPages) throw new Error("O laudo excede 1.200 páginas. Nenhum PDF parcial foi gerado.");
    page = doc.addPage(A4);
    page.drawRectangle({ x: 0, y: A4[1] - 5, width: A4[0], height: 5, color: colors.orange });
    if (logo) {
      const scale = Math.min(100 / logo.width, 62 / logo.height);
      page.drawImage(logo, { x: MARGIN - 4, y: A4[1] - 73, width: logo.width * scale, height: logo.height * scale });
    } else {
      page.drawText("MOBILIZA", { x: MARGIN, y: A4[1] - 37, size: 17, font: bold, color: colors.ink });
      page.drawText("FACILITIES", { x: MARGIN, y: A4[1] - 51, size: 8, font: regular, color: colors.muted });
    }
    const headerWidth = WIDTH - 115;
    const reportLines = wrap(`${reportNumber} | Revisão ${s.version}`, headerWidth, 8.2, bold);
    reportLines.slice(0, 3).forEach((line, i) => page.drawText(line, {
      x: A4[0] - MARGIN - bold.widthOfTextAtSize(line, 8.2), y: A4[1] - 29 - i * 10,
      size: 8.2, font: bold, color: colors.ink,
    }));
    page.drawText(`Vistoria de ${TYPE_NAMES[s.inspection_type]} | ${dateLabel(s.inspected_on)}`, {
      x: MARGIN + 115, y: A4[1] - 63, size: 9, font: regular, color: colors.muted,
    });
    page.drawLine({ start: { x: MARGIN, y: 766 }, end: { x: A4[0] - MARGIN, y: 766 }, thickness: 0.7, color: colors.line });
    if (doc.getPageCount() > 1) {
      const lines = wrap(context, WIDTH, 8, regular);
      lines.forEach((line, index) => page.drawText(line, { x: MARGIN, y: 753 - index * 10, size: 8, font: regular, color: colors.muted }));
      y = CONTENT_TOP - lines.length * 10 - 9;
    } else y = CONTENT_TOP;
  }
  function ensure(height: number) { if (y - height < BOTTOM) pageStart(); }
  function paragraph(value: string, opts: { size?: number; bold?: boolean; muted?: boolean; after?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? bold : regular;
    const lineHeight = size * 1.42;
    for (const line of wrap(value, WIDTH, size, font)) {
      ensure(lineHeight);
      if (line) page.drawText(line, { x: MARGIN, y: y - size, size, font, color: opts.muted ? colors.muted : colors.ink });
      y -= lineHeight;
    }
    y -= opts.after ?? 7;
  }
  function section(title: string, level = 1) {
    context = title;
    const lines = wrap(title, WIDTH - 15, level === 1 ? 14 : 11.6, bold);
    ensure(lines.length * 18 + 36);
    y -= 8;
    page.drawRectangle({ x: MARGIN, y: y - 16, width: 3, height: 17, color: colors.orange });
    for (const line of lines) {
      const size = level === 1 ? 14 : 11.6;
      page.drawText(line, { x: MARGIN + 12, y: y - size, size, font: bold, color: colors.ink });
      y -= 18;
    }
    y -= 9;
  }
  function field(label: string, value: string | null | undefined, includeEmpty = false) {
    if (!value && !includeEmpty) return;
    ensure(39);
    paragraph(label, { size: 8.5, bold: true, muted: true, after: 1 });
    paragraph(value || "Não informado", { size: 10.3, after: 9 });
  }
  function pairedFields(left: [string, string], right: [string, string]) {
    const gap = 20, width = (WIDTH - gap) / 2;
    const labels = [wrap(left[0], width, 8.5, bold), wrap(right[0], width, 8.5, bold)];
    const lines = [wrap(left[1], width, 10.2), wrap(right[1], width, 10.2)];
    const labelHeight = Math.max(...labels.map(v => v.length)) * 12;
    const height = labelHeight + Math.max(...lines.map(v => v.length)) * 14 + 12;
    if (height > 500) { field(...left); field(...right); return; }
    ensure(height);
    labels.forEach((group, column) => group.forEach((line, index) => page.drawText(line, {
      x: MARGIN + column * (width + gap), y: y - 9 - index * 12, size: 8.5, font: bold, color: colors.muted,
    })));
    lines.forEach((group, column) => group.forEach((line, index) => page.drawText(line, {
      x: MARGIN + column * (width + gap), y: y - labelHeight - 10.2 - index * 14, size: 10.2, font: regular, color: colors.ink,
    })));
    y -= height;
  }
  pageStart();
  paragraph("Laudo de vistoria", { size: 25, bold: true, after: 4 });
  paragraph(`${TYPE_NAMES[s.inspection_type]} | Revisão salva ${s.version}`, { size: 12, after: 17 });
  section("Identificação do imóvel");
  field("Imóvel", s.property.name, true);
  field("Endereço", s.property.address, true);
  pairedFields(["Número de controle", s.property.control_number === null ? "Não informado" : String(s.property.control_number)], ["UF", s.property.state_code || "Não informada"]);
  field("Obra / unidade", s.property.worksite_name);
  section("Dados da vistoria");
  pairedFields(["Data da vistoria", dateLabel(s.inspected_on)], ["Vistoriador informado", s.inspector]);
  field("Locador", s.lessor);
  field("Locatário", s.lessee);
  pairedFields(["Registro criado em", timestampLabel(s.created_at)], ["Revisão salva em", timestampLabel(s.updated_at)]);
  paragraph(`${s.environments.length} ambiente(s) | ${s.items.length} item(ns) | ${detail.photos.length} foto(s) | ${detail.signatures.length} assinatura(s) nesta revisão`, { size: 9, muted: true });
  if (detail.current_version !== s.version) paragraph(`Revisão histórica ${s.version}. A revisão atual no momento da consulta é ${detail.current_version}.`, { size: 9, bold: true });
  if (s.source_mobilization || s.source_handover || s.entry_inspection_id) {
    section("Referências vinculadas");
    if (s.source_mobilization) {
      const source = s.source_mobilization;
      field("Mobilização de origem", `${source.id} | Revisão ${source.version}`);
      pairedFields(["Cliente da mobilização", source.client_name || "Não informado"], ["Centro de custo", source.cost_center_name || "Não informado"]);
      paragraph("As quantidades planejadas e conferidas da origem são referências. A quantidade observada consta separadamente em cada item desta vistoria.", { size: 9, muted: true });
    }
    if (s.source_handover) field("Entrega vinculada", `${s.source_handover.id} | Revisão ${s.source_handover.revision} | Entregue em ${dateLabel(s.source_handover.delivered_on)}`);
    if (s.entry_inspection_id) field("Vistoria de entrada vinculada", `${s.entry_inspection_id} | Revisão ${s.entry_inspection_version}`);
  }
  if (s.keys || s.water || s.energy) {
    section("Chaves e medidores");
    field("Chaves", s.keys); field("Água", s.water); field("Energia elétrica", s.energy);
  }
  field("Observações gerais", s.notes);
  if (s.contestation) { section("Ressalvas / contestação informada"); paragraph(s.contestation); }

  let photoOrdinal = 0;
  async function photos(photosToDraw: InspectionPhoto[], itemCaption: string) {
    if (!photosToDraw.length) return;
    const gap = 14, cardWidth = (WIDTH - gap) / 2, imageHeight = 155;
    paragraph(`Registro fotográfico | ${photosToDraw.length} foto(s)`, { size: 9, bold: true, after: 9 });
    for (let start = 0; start < photosToDraw.length; start += 2) {
      checkAbort(signal);
      const group = photosToDraw.slice(start, start + 2);
      const data = group.map(photo => ({
        photo,
        heading: `Foto ${++photoOrdinal} | ${itemCaption}`,
        caption: [photo.caption, `${photo.environment_name} / ${photo.item_name}`, `Incluída na revisão ${photo.version} | ${timestampLabel(photo.uploaded_at)}`].filter(Boolean).join("\n"),
      }));
      const titles = data.map(v => wrap(v.heading, cardWidth - 12, 8.7, bold));
      const captions = data.map(v => wrap(v.caption, cardWidth - 12, 8.5));
      const titleHeight = Math.max(...titles.map(v => v.length)) * 12;
      const captionHeight = Math.max(...captions.map(v => v.length)) * 11.7;
      const rowHeight = imageHeight + titleHeight + captionHeight + 24;
      // Very long immutable captions remain complete as a full-width text block.
      if (rowHeight > 520) {
        for (const entry of data) {
          paragraph(entry.heading, { size: 10, bold: true });
          ensure(imageHeight + 12);
          drawContained(await evidence({ kind: "photo", id: entry.photo.id }), MARGIN, y - imageHeight, WIDTH, imageHeight);
          y -= imageHeight + 9;
          paragraph(entry.caption, { size: 9 });
        }
        continue;
      }
      ensure(rowHeight + 8);
      for (let column = 0; column < data.length; column++) {
        const x = MARGIN + column * (cardWidth + gap);
        const entry = data[column];
        const picture = await evidence({ kind: "photo", id: entry.photo.id });
        page.drawRectangle({ x, y: y - rowHeight, width: cardWidth, height: rowHeight, color: colors.pale, borderColor: colors.line, borderWidth: 0.6 });
        titles[column].forEach((line, index) => page.drawText(line, { x: x + 6, y: y - 13 - index * 12, size: 8.7, font: bold, color: colors.ink }));
        drawContained(picture, x + 6, y - titleHeight - imageHeight - 8, cardWidth - 12, imageHeight);
        captions[column].forEach((line, index) => {
          if (line) page.drawText(line, { x: x + 6, y: y - titleHeight - imageHeight - 20 - index * 11.7, size: 8.5, font: regular, color: colors.muted });
        });
      }
      y -= rowHeight + 12;
    }
  }
  function drawContained(picture: PDFImage, x: number, bottom: number, width: number, height: number) {
    const scale = Math.min(width / picture.width, height / picture.height);
    const w = picture.width * scale, h = picture.height * scale;
    page.drawImage(picture, { x: x + (width - w) / 2, y: bottom + (height - h) / 2, width: w, height: h });
  }
  const orderedPhotos = [...detail.photos].sort((a, b) => a.version - b.version || a.position - b.position || a.id.localeCompare(b.id));
  const environments = new Map(s.environments.map(e => [e.id, e]));
  if (environments.size !== s.environments.length || s.items.some(i => !environments.has(i.environment_id))) {
    throw new Error("A organização dos ambientes está incompleta. Reabra a vistoria salva.");
  }
  const visited = new Set<string>();
  async function renderEnvironment(environment: InspectionEnvironment, number: string, ancestors: string[]) {
    if (visited.has(environment.id)) throw new Error("Há um ciclo nos ambientes. O PDF não foi gerado.");
    visited.add(environment.id);
    section(`${number} ${environment.name}`);
    if (ancestors.length) paragraph(ancestors.join(" / "), { size: 9, muted: true });
    const items = s.items.filter(i => i.environment_id === environment.id);
    if (!items.length) paragraph("Nenhum item registrado neste ambiente.", { size: 9, muted: true });
    for (const [index, item] of items.entries()) await renderItem(item, `${number} - Item ${index + 1}`);
    const children = s.environments.filter(e => e.parent_id === environment.id);
    for (const [index, child] of children.entries()) await renderEnvironment(child, `${number}.${index + 1}`, [...ancestors, environment.name]);
  }
  async function renderItem(item: InspectionItem, number: string) {
    section(`${number} ${item.name}`, 2);
    pairedFields(["Quantidade observada", item.quantity === null ? "Não informada" : String(item.quantity)], ["Estado / condição", item.condition || "Não informado"]);
    const attrs = [["Marca", item.brand], ["Modelo", item.model], ["Material", item.material], ["Cor", item.color]].filter(([, value]) => Boolean(value));
    for (let i = 0; i < attrs.length; i += 2) {
      if (attrs[i + 1]) pairedFields(attrs[i] as [string, string], attrs[i + 1] as [string, string]);
      else field(attrs[i][0], attrs[i][1]);
    }
    const source = s.source_mobilization?.items.find(v => v.id === item.source_item_id);
    if (source) paragraph(`Origem: planejada ${source.planned === null ? "não informada" : source.planned}; conferida ${source.checked === null ? "não informada" : source.checked}.`, { size: 9, muted: true });
    field("Descrição", item.description);
    field("Observações do item", item.note);
    field("Pendência", item.pending ? "Sim" : "Não");
    if (item.pending || item.responsible || item.due_on) pairedFields(["Responsável informado", item.responsible || "Não informado"], ["Prazo informado", dateLabel(item.due_on)]);
    await photos(orderedPhotos.filter(p => p.item_id === item.id), `${number} ${item.name}`);
    context = `${number} ${item.name}`;
  }
  section("Ambientes e itens vistoriados");
  if (!s.environments.length) paragraph("Nenhum ambiente ou item registrado nesta revisão.");
  const roots = s.environments.filter(e => !e.parent_id);
  for (const [index, environment] of roots.entries()) await renderEnvironment(environment, String(index + 1), []);
  if (visited.size !== s.environments.length) throw new Error("Há ambientes sem uma origem válida. O PDF não foi gerado.");
  const itemIds = new Set(s.items.map(i => i.id));
  const orphanedPhotos = orderedPhotos.filter(p => !itemIds.has(p.item_id));
  if (orphanedPhotos.length) {
    section("Fotos de itens de revisões anteriores");
    paragraph("Estas fotos permanecem no histórico, mas seus itens não estão na lista desta revisão. As legendas preservam o ambiente e o item registrados no envio.", { size: 9, muted: true });
    await photos(orphanedPhotos, "Registro histórico");
  }
  context = "Assinaturas desta revisão";
  ensure(detail.signatures.length ? 255 : 135);
  section("Assinaturas desta revisão");
  paragraph(`As assinaturas abaixo se referem exclusivamente à revisão ${s.version} deste laudo.`, { size: 9, muted: true });
  if (!detail.signatures.length) paragraph("Nenhuma assinatura registrada nesta revisão.", { bold: true });
  for (const signature of detail.signatures) {
    ensure(185);
    paragraph(signature.actor.name, { size: 11, bold: true, after: 3 });
    if (signature.actor.title) paragraph(signature.actor.title, { size: 9, muted: true });
    const picture = await evidence({ kind: "signature", id: signature.id });
    drawContained(picture, MARGIN, y - 70, 240, 70);
    y -= 78;
    paragraph(`Assinatura registrada pela própria conta autenticada em ${timestampLabel(signature.signed_at)}.`, { size: 9 });
    field("Declaração registrada", signature.statement_text);
    paragraph(`Referência: ${signature.id} | Declaração ${signature.statement_version}`, { size: 8, muted: true });
    paragraph(`Impressão da revisão (SHA-256): ${signature.snapshot_sha256}`, { size: 7.8, muted: true });
  }
  const unsigned = [
    ["Vistoriador informado", s.inspector],
    ...(s.lessor ? [["Locador informado", s.lessor]] : []),
    ...(s.lessee ? [["Locatário informado", s.lessee]] : []),
  ];
  paragraph("Campos para assinatura manual", { size: 10, bold: true, after: 5 });
  paragraph("Os campos em branco abaixo estão sem assinatura neste arquivo. Os nomes informados não atribuem a eles as assinaturas de contas acima.", { size: 8.5, muted: true });
  for (const [role, name] of unsigned) {
    ensure(71);
    y -= 24;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + Math.min(WIDTH, 340), y }, thickness: 0.7, color: colors.muted });
    y -= 6;
    paragraph(`${role}: ${name || "Não informado"}`, { size: 9, after: 2 });
    paragraph("SEM ASSINATURA", { size: 7.8, muted: true, after: 8 });
  }
  onProgress?.({ stage: "rendering", completed: completedImages, total: imageCount });
  const pages = doc.getPages();
  pages.forEach((p, index) => {
    p.drawLine({ start: { x: MARGIN, y: 41 }, end: { x: A4[0] - MARGIN, y: 41 }, thickness: 0.7, color: colors.line });
    const foot = `Mobiliza Facilities | Vistoria de ${TYPE_NAMES[s.inspection_type]} | Revisão ${s.version}`;
    p.drawText(foot, { x: MARGIN, y: 27, size: 7.2, font: regular, color: colors.muted });
    const pagination = `Página ${index + 1} de ${pages.length}`;
    p.drawText(pagination, { x: A4[0] - MARGIN - regular.widthOfTextAtSize(pagination, 7.5), y: 27, size: 7.5, font: regular, color: colors.muted });
  });
  checkAbort(signal);
  const bytes = await doc.save({ useObjectStreams: true });
  checkAbort(signal);
  onProgress?.({ stage: "ready", completed: completedImages, total: imageCount });
  return { bytes, filename: inspectionPdfFilename(detail), pageCount: pages.length, version: s.version };
}

async function fetchPrivate(path: string, signal?: AbortSignal) {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || !path.startsWith("/") || path.startsWith("//")) {
    throw new Error("O PDF só pode carregar arquivos privados deste sistema.");
  }
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal });
  } catch {
    checkAbort(signal);
    throw new Error("Não foi possível carregar todos os dados privados da vistoria. Confira sua conexão e tente novamente. Nenhum PDF parcial foi baixado.");
  }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new Error("Sua sessão ou permissão mudou. Entre novamente e reabra a vistoria para baixar o PDF.");
    throw new Error("Um arquivo ou a revisão da vistoria não está disponível. Reabra a vistoria e tente novamente. Nenhum PDF parcial foi baixado.");
  }
  return response;
}
async function readBounded(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new Error("Um arquivo excede o limite de tamanho do PDF. Nenhum PDF parcial foi baixado.");
  }
  if (!response.body) throw new Error("Um arquivo veio sem conteúdo. O PDF não foi gerado.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error("Um arquivo excede o limite de tamanho do PDF. Nenhum PDF parcial foi baixado.");
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function fetchPrivateImage(path: string, signal?: AbortSignal): Promise<InspectionPdfImage> {
  const response = await fetchPrivate(path, signal);
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (mimeType !== "image/png" && mimeType !== "image/jpeg") {
    await response.body?.cancel();
    throw new Error("Uma imagem não está em JPEG ou PNG. O PDF completo não foi gerado.");
  }
  return { bytes: await readBounded(response, INSPECTION_PDF_LIMITS.maxImageBytes), mimeType };
}

/** Re-fetch the selected saved revision on click; never pass form state to export. */
export async function downloadPropertyInspectionPdf(options: InspectionPdfOptions) {
  const { propertyId, inspectionId, version, signal, onProgress } = options;
  if (!ID.test(propertyId) || !ID.test(inspectionId) || !Number.isSafeInteger(version) || version < 1) {
    throw new Error("Selecione uma revisão salva antes de baixar o PDF.");
  }
  checkAbort(signal);
  onProgress?.({ stage: "snapshot", completed: 0, total: 0 });
  const query = new URLSearchParams({ property_id: propertyId, id: inspectionId, version: String(version) });
  const response = await fetchPrivate(`/api/property-inspections?${query}`, signal);
  let detail: InspectionDetail;
  try { detail = JSON.parse(new TextDecoder().decode(await readBounded(response, INSPECTION_PDF_LIMITS.maxSnapshotBytes))) as InspectionDetail; }
  catch { throw new Error("Não foi possível ler a revisão salva. Reabra a vistoria e tente novamente."); }
  if (detail.inspection?.id !== inspectionId || detail.inspection.property_id !== propertyId || detail.inspection.version !== version) {
    throw new Error("A revisão recebida não corresponde à selecionada. Reabra a vistoria.");
  }
  const logoImage = await fetchPrivateImage("/mobiliza-logo-0cff20bedde7.jpeg", signal);
  const result = await buildPropertyInspectionPdf({
    detail, logoImage, signal, onProgress,
    loadImage: reference => fetchPrivateImage(reference.kind === "photo"
      ? `/api/property-inspection-photos/${encodeURIComponent(reference.id)}`
      : `/api/property-inspection-signatures/${encodeURIComponent(reference.id)}`, signal),
  });
  checkAbort(signal);
  const blob = new Blob([new Uint8Array(result.bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = result.filename; link.style.display = "none";
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
  return { filename: result.filename, pageCount: result.pageCount, byteLength: result.bytes.length, version: result.version };
}
