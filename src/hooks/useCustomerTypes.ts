import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const DEFAULT_TYPES = ["Short-Term", "Long-Term", "Annual"];

export function useCustomerTypes() {
  const [customerTypes, setCustomerTypes] = useState<string[]>(DEFAULT_TYPES);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCustomerTypes = async () => {
      try {
        const rows = await apiFetch<{ name: string }[]>("/api/customer-types");
        const names = rows.map((r) => r.name).sort();
        if (names.length > 0) {
          setCustomerTypes(names);
        }
      } catch (error) {
        // Keep default types if fetch fails
        console.error("Failed to load customer types:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomerTypes();
  }, []);

  return { customerTypes, isLoading };
}
