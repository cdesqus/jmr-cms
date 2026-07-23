export type StructuredAddress = Readonly<{
  recipient: string;
  phone: string;
  countryCode: string;
  subdivisionCode: string;
  locality: string;
  postalCode: string;
  street: string;
  building: string;
  unit: string;
  instructions: string;
}>;
export function normaliseRomanianAddress(input?: Partial<StructuredAddress>): StructuredAddress;
export function validateRomanianAddress(address: StructuredAddress): string[];
