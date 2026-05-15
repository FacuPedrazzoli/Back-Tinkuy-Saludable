import { z } from "zod";

export const emailSchema = z
  .string()
  .min(1, "Email requerido")
  .email("Email inválido")
  .transform((v) => v.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .max(128, "Máximo 128 caracteres")
  .regex(/[A-Z]/, "Al menos una mayúscula")
  .regex(/[0-9]/, "Al menos un número")
  .regex(/[^A-Za-z0-9]/, "Al menos un carácter especial");

export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones")
  .transform((v) => v.toLowerCase().trim());

export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  take: z.number().int().min(1).max(100).default(20),
  skip: z.number().int().min(0).default(0),
});

export const moneySchema = z
  .number()
  .min(0, "El precio no puede ser negativo")
  .transform((v) => Math.round(v * 100) / 100);

/**
 * Sanitize string input to prevent XSS/injection.
 * Handles HTML tags, script injection, and special characters.
 */
export function sanitizeString(input: string | null | undefined): string | null {
  if (!input) return null;
  return input
    .trim()
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .slice(0, 5000);
}

export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
