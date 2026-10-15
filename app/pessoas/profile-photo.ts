const INPUT_LIMIT = 20 * 1024 * 1024;
const OUTPUT_LIMIT = 4 * 1024 * 1024;
const MAX_SIDE = 640;

export async function prepareProfilePhoto(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Escolha uma foto JPG, PNG ou WebP.');
  }
  if (!file.size || file.size > INPUT_LIMIT) {
    throw new Error('Escolha uma foto de até 20 MB.');
  }

  let bitmap: ImageBitmap | null = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 64_000_000) {
      throw new Error('Escolha uma foto com resolução menor.');
    }
    const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto. Escolha outra imagem.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas!.toBlob(result => result ? resolve(result) : reject(new Error('Não foi possível preparar a foto. Escolha outra imagem.')), 'image/jpeg', 0.82);
    });
    if (blob.type !== 'image/jpeg' || !blob.size || blob.size > OUTPUT_LIMIT) {
      throw new Error('Não foi possível reduzir a foto para envio. Escolha outra imagem.');
    }
    return new File([blob], 'foto-perfil.jpg', {type: 'image/jpeg'});
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('Escolha uma foto com resolução')) throw cause;
    throw new Error('Não foi possível preparar a foto. Escolha outra imagem.');
  } finally {
    bitmap?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
