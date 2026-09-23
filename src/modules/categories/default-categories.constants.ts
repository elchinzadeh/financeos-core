import type { CategoryKind } from '../../generated/prisma/enums.js';

/** Yeni istifadəçi qeydiyyatdan keçəndə ona məxsus (userId dolu) nümunə kateqoriyalar kimi klonlanır. */
export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind; icon: string }[] = [
  { name: 'Maaş', kind: 'income', icon: '💼' },
  { name: 'Freelance', kind: 'income', icon: '💻' },
  { name: 'Digər gəlir', kind: 'income', icon: '➕' },
  { name: 'Yemək', kind: 'expense', icon: '🍽️' },
  { name: 'Nəqliyyat', kind: 'expense', icon: '🚗' },
  { name: 'Kommunal', kind: 'expense', icon: '🏠' },
  { name: 'Əyləncə', kind: 'expense', icon: '🎮' },
  { name: 'Digər xərc', kind: 'expense', icon: '➖' },
  { name: 'Daxili köçürmə', kind: 'income', icon: '🔁' },
  { name: 'Daxili köçürmə', kind: 'expense', icon: '🔁' },
];

/**
 * Bank çıxarışı idxalında satıcı adına görə kateqoriya təklifi (docs/decisions/0016-bank-statement-import.md).
 * Qeydiyyatda `DEFAULT_CATEGORIES`-dən yaradılmış istifadəçiyə məxsus kateqoriyalara map edilərək klonlanır
 * (bax docs/decisions/0018-per-user-categories.md) — `categoryName`/`categoryKind` yalnız bu klonlama üçündür.
 */
export const DEFAULT_CATEGORY_SUGGESTION_RULES: {
  keyword: string;
  categoryName: string;
  categoryKind: CategoryKind;
}[] = [
  { keyword: 'Uber', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'Bolt Food', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'Bolt', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'Wolt', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'Araz Supermarket', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'Bravo', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'Spar', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'Socar Petrol', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'Azpetrol', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'TP METRO', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'TP BUS', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'AzParking', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'ADY railway', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'Azərişıq', categoryName: 'Kommunal', categoryKind: 'expense' },
  { keyword: 'Azəriqaz', categoryName: 'Kommunal', categoryKind: 'expense' },
  { keyword: 'Bakcell', categoryName: 'Kommunal', categoryKind: 'expense' },
  { keyword: 'Azercell', categoryName: 'Kommunal', categoryKind: 'expense' },
  { keyword: 'Gloria Jeans', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'Costa Coffee', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'McDonalds', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'KFC', categoryName: 'Yemək', categoryKind: 'expense' },
];
