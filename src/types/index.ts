export type Category = {
  id: string;
  name: string;
};

export type Transaction = {
  id: string;
  amount: number;
  currency: string;
  date: string;
  vendor_name: string;
  category_id: string;
  is_user_verified: boolean;
  categories?: { name: string };
};