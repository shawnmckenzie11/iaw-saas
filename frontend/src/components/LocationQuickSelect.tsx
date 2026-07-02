import { getLocationShortName } from '../utils/pricing';

export interface LocationQuickSelectProps {
  label: string;
  quickOptions: string[];
  fullOptions: string[];
  selected: string;
  isOther: boolean;
  showAll: boolean;
  hideMore?: boolean;
  onSelect: (name: string) => void;
  onOther: () => void;
  onShowAll: () => void;
}

/**
 * Horizontal quick-select row with More and Other modes ported from mobile PickupScreen.
 */
export default function LocationQuickSelect({
  label,
  quickOptions,
  fullOptions,
  selected,
  isOther,
  showAll,
  hideMore = false,
  onSelect,
  onOther,
  onShowAll,
}: LocationQuickSelectProps) {
  const showAllTrigger =
    showAll || quickOptions.length === 0 || quickOptions.length >= fullOptions.length;
  const chips = showAllTrigger ? fullOptions : quickOptions;

  return (
    <div className="prominent-section">
      <div className="input-label-blue">{label}</div>
      <div className="chip-row presets-horizontal-scroller">
        {chips.map((name) => (
          <button
            key={`quick-${name}`}
            type="button"
            className={
              selected === name && !isOther ? 'quick-select-btn active' : 'quick-select-btn'
            }
            onClick={() => onSelect(name)}
          >
            {getLocationShortName(name)}
          </button>
        ))}
        {!hideMore && !showAllTrigger && (
          <button type="button" className="quick-select-btn utility-chip" onClick={onShowAll}>
            More...
          </button>
        )}
        <button
          type="button"
          className={isOther ? 'quick-select-btn utility-chip active' : 'quick-select-btn utility-chip'}
          onClick={onOther}
        >
          Other
        </button>
      </div>

      {selected && !isOther && (
        <div className="selected-location-pill">
          ✓ {getLocationShortName(selected)}
        </div>
      )}
    </div>
  );
}
