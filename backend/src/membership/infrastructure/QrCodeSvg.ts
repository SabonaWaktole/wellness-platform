import QRCode from 'qrcode';
import type { IQrCodeRenderer } from '../application/ports/ICardStore';

/** The side of the drawing in pixels: the card must be readable at 220 px or more (FR-CRD-02, NFR-USE-05). */
export const QR_SIZE = 240;

/**
 * Draws the QR on the server so the card works with no client script (D13):
 * error correction M, a four-module quiet zone, and black on a white
 * background that stays white in a dark theme (NFR-USE-05).
 */
export class QrCodeSvg implements IQrCodeRenderer {
  svg(text: string): Promise<string> {
    return QRCode.toString(text, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 4,
      width: QR_SIZE,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }
}
