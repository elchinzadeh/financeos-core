interface PathCategory {
  id: string;
  name: string;
  parentId: string | null;
}

/** Kateqoriyanın tam yol adını qaytaran funksiya yaradır: `"Yemək › Market"`. AI variant izahları üçün istifadə olunur. */
export function createCategoryPathResolver(categories: PathCategory[]): (category: PathCategory) => string {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (category) => {
    const parts = [category.name];
    let parent = category.parentId ? byId.get(category.parentId) : undefined;
    // Dövr yoxlaması backend-də var (ADR-0018), amma sonsuz dövrədən qorunmaq üçün dərinlik məhdudlaşdırılır.
    for (let depth = 0; parent && depth < 10; depth++) {
      parts.unshift(parent.name);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return parts.join(' › ');
  };
}
