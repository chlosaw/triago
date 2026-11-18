import type { Category, Priority } from '@triago/shared';
import { priorityLabel } from '../../lib/labels';

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`pill pill-${priority}`}>{priorityLabel(priority)}</span>;
}

export function CategoryLabel({ category }: { category: Category }) {
  return <span className={`category-label category-${category}`}>{category}</span>;
}
