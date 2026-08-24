import { CATEGORIES, labelFor, type Category, type ShoppingItem } from '@vsa/shared';
import type { Strings } from '../lib/i18n.js';

interface ShoppingListProps {
  items: ShoppingItem[];
  language: string;
  strings: Strings;
  /** Ids added by the most recent command, highlighted once on arrival. */
  freshIds: Set<string>;
  onToggleDone: (item: ShoppingItem) => void;
  onRemove: (item: ShoppingItem) => void;
}

/** Group by aisle, in the order a shopper actually walks a store. */
function groupByAisle(items: ShoppingItem[]): [Category, ShoppingItem[]][] {
  const groups = new Map<Category, ShoppingItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.category) ?? [];
    bucket.push(item);
    groups.set(item.category, bucket);
  }
  return CATEGORIES.filter((category) => groups.has(category)).map((category) => [
    category,
    groups.get(category)!,
  ]);
}

function TickIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d="M3 8l3.2 3.2L12 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M4 4l7 7M11 4l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ShoppingList({
  items,
  language,
  strings,
  freshIds,
  onToggleDone,
  onRemove,
}: ShoppingListProps) {
  if (items.length === 0) {
    return (
      <div className="empty">
        <strong>{strings.emptyTitle}</strong>
        {strings.emptyBody}
        <p style={{ margin: '10px 0 0' }}>
          {strings.tryExamples.map((example, index) => (
            <span key={example}>
              {index > 0 ? '  ·  ' : ''}
              <code>{example}</code>
            </span>
          ))}
        </p>
      </div>
    );
  }

  return (
    <div>
      {groupByAisle(items).map(([category, group]) => (
        <div key={category}>
          <div className="aisle">
            <span>{strings.aisles[category]}</span>
            <span className="aisle-rule" />
            <span className="aisle-count">{group.length}</span>
          </div>

          <ul className="rows">
            {group.map((item) => (
              <li
                key={item.id}
                className={`row${item.done ? ' is-done' : ''}${freshIds.has(item.id) ? ' is-new' : ''}`}
              >
                {/* Quantity in the gutter, like the price on a shelf label. */}
                <div className="row-qty">
                  {item.quantity}
                  {item.unit ? <small>{item.unit}</small> : null}
                </div>

                <button
                  type="button"
                  className="row-name"
                  onClick={() => onToggleDone(item)}
                  aria-pressed={item.done}
                  title={strings.markBought}
                >
                  {labelFor(item.canonical, language)}
                  {item.raw && item.raw.toLowerCase() !== item.canonical.toLowerCase() ? (
                    <span>“{item.raw}”</span>
                  ) : null}
                </button>

                <div className="row-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onToggleDone(item)}
                    aria-label={`${strings.markBought}: ${item.canonical}`}
                  >
                    <TickIcon />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => onRemove(item)}
                    aria-label={`${strings.removeItem}: ${item.canonical}`}
                  >
                    <CrossIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
