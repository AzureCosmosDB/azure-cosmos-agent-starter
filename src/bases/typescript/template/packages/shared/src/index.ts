export interface Page<T> {
  items: T[];
  continuationToken?: string;
  requestCharge: number;
}

export const MAX_PAGE_SIZE = 100;
