import { z } from "zod";

export const CustomerFormSchema = z.object({
  name: z.string()
    .min(1, "Name is required")
    .min(2, "Name must be at least 2 characters")
    .trim(),
  email: z.string()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .trim(),
  plate: z.string()
    .min(1, "License plate is required")
    .min(2, "License plate must be at least 2 characters")
    .transform(val => val.toUpperCase().trim()),
  phone: z.string()
    .trim()
    .optional()
    .transform(val => val && val.length > 0 ? val : undefined),
  type: z.string()
    .min(1, "Customer type is required"),
});

export type CustomerFormInput = z.infer<typeof CustomerFormSchema>;

export function validateCustomerForm(data: unknown) {
  const result = CustomerFormSchema.safeParse(data);
  return {
    isValid: result.success,
    data: result.data,
    errors: result.error?.flatten().fieldErrors || {},
  };
}
