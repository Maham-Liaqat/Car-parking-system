import { useReducer, useCallback } from "react";
import { CustomerFormInput } from "@/lib/schemas";

interface FormState extends CustomerFormInput {
  type: string;
}

type FormAction =
  | { type: "SET_NAME"; payload: string }
  | { type: "SET_EMAIL"; payload: string }
  | { type: "SET_PLATE"; payload: string }
  | { type: "SET_PHONE"; payload: string }
  | { type: "SET_TYPE"; payload: string }
  | { type: "RESET" }
  | { type: "SET_FROM_CUSTOMER"; payload: Partial<FormState> };

const initialState: FormState = {
  name: "",
  email: "",
  plate: "",
  phone: undefined,
  type: "Short-Term",
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_NAME":
      return { ...state, name: action.payload };
    case "SET_EMAIL":
      return { ...state, email: action.payload };
    case "SET_PLATE":
      return { ...state, plate: action.payload };
    case "SET_PHONE":
      return { ...state, phone: action.payload };
    case "SET_TYPE":
      return { ...state, type: action.payload };
    case "RESET":
      return initialState;
    case "SET_FROM_CUSTOMER":
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

export function useCustomerForm(defaultType?: string) {
  const [state, dispatch] = useReducer(
    formReducer,
    defaultType ? { ...initialState, type: defaultType } : initialState
  );

  const setName = useCallback((name: string) => {
    dispatch({ type: "SET_NAME", payload: name });
  }, []);

  const setEmail = useCallback((email: string) => {
    dispatch({ type: "SET_EMAIL", payload: email });
  }, []);

  const setPlate = useCallback((plate: string) => {
    dispatch({ type: "SET_PLATE", payload: plate });
  }, []);

  const setPhone = useCallback((phone: string) => {
    dispatch({ type: "SET_PHONE", payload: phone });
  }, []);

  const setType = useCallback((type: string) => {
    dispatch({ type: "SET_TYPE", payload: type });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const setFromCustomer = useCallback((customer: Partial<FormState>) => {
    dispatch({ type: "SET_FROM_CUSTOMER", payload: customer });
  }, []);

  return {
    formData: state,
    setName,
    setEmail,
    setPlate,
    setPhone,
    setType,
    reset,
    setFromCustomer,
  };
}
