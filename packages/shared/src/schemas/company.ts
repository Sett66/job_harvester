import { z } from 'zod';

export const companySchema = z.object({
  id: z.string().uuid(),
  canonicalName: z.string().min(1),
  industry: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
});

export const createCompanySchema = z.object({
  canonicalName: z.string().min(1, '公司名称不能为空'),
  industry: z.string().optional(),
  website: z.string().optional(),
  note: z.string().optional(),
});

export type Company = z.infer<typeof companySchema>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
