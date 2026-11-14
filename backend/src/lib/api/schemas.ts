import { z } from 'zod';
import { APP_CONFIG } from '@/config/app';

/** Request validation shared by every route. */
export const schemas = {
  userId: z.string().uuid(),
  lang: z.enum(['en', 'hi', 'bn']),
  vpa: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9._-]+@[a-z0-9]+$/, 'Enter a UPI ID like name@kavach'),
  amountPaise: z.number().int().positive().max(APP_CONFIG.maxAmountPaise),
  note: z.string().trim().max(APP_CONFIG.maxNoteLength).default(''),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits'),
  message: z
    .object({
      text: z.string().max(2000).optional(),
      image: z
        .object({
          mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
          dataBase64: z
            .string()
            .max(Math.ceil((4 * 1024 * 1024 * 4) / 3) + 4, 'Image is larger than 4 MB')
            .regex(/^[A-Za-z0-9+/=]+$/, 'Image must be base64'),
        })
        .optional(),
    })
    .refine((m) => (m.text && m.text.trim()) || m.image, 'Paste a message or attach a screenshot'),
};

export const idempotencyKeySchema = z.string().min(8).max(255).regex(/^[A-Za-z0-9_\-:.]+$/);
