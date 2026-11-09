import type { CSSProperties } from "react";
import type { DonateBarState } from "../lib/donatebar";
import {
  donateBarLabel,
  donateBarMainTotal,
  donateBarOtherCurrencies,
  donateBarProgress,
  donateBarStyle,
  formatDonateAmount,
} from "../lib/donatebar";

/**
 * Полоса донатов. Обычные стили делят одну структуру (шапка / дорожка /
 * подвал). «Кольцо» — другая раскладка: процент в центре, сумма рядом.
 * Используется и OBS-виджетом (?mode=donatebar), и предпросмотром
 * во вкладке «Донаты».
 */
export default function DonateBar({ state, title = "Донаты" }: { state: DonateBarState; title?: string }) {
  const style = donateBarStyle(state.style);
  const label = donateBarLabel(state.title, title);
  const compact = state.barOnly === true;
  const total = donateBarMainTotal(state);
  const progress = donateBarProgress(state);
  const pct = Math.round(progress * 1000) / 10;
  const pctText = `${pct.toLocaleString("ru-RU")}%`;
  const others = donateBarOtherCurrencies(state);
  const hasGoal = state.goal > state.start;
  const showPct = hasGoal || compact;
  const done = hasGoal && progress >= 1;
  const css = {
    "--ybar-pct": `${pct}%`,
    "--ybar-ratio": String(Math.max(0.0001, progress)),
  } as CSSProperties;

  const othersNode =
    !compact && others.length > 0 ? (
      <span className="ybar-others">
        + {others.map((o) => `${formatDonateAmount(o.amount)} ${o.currency}`).join(" · ")}
      </span>
    ) : null;

  const amounts = (
    <span className="ybar-amounts">
      <b className="ybar-total">
        {formatDonateAmount(total)} {state.currency}
      </b>
      {hasGoal && (
        <span className="ybar-goal">
          {" "}
          / {formatDonateAmount(state.goal)} {state.currency}
        </span>
      )}
    </span>
  );

  if (style.id === "ring") {
    return (
      <div
        className={`ybar ybar-ring${done ? " ybar-done" : ""}${compact ? " ybar-compact" : ""}`}
        style={css}
      >
        <div className="ybar-ringbox">
          <div className="ybar-track" aria-hidden="true">
            <div className="ybar-fill">
              <i className="ybar-fill-edge" />
            </div>
          </div>
          {showPct ? (
            <span className="ybar-percent">{pctText}</span>
          ) : (
            <span className="ybar-percent ybar-nogoal">цель не задана</span>
          )}
        </div>
        {!compact && (
          <div className="ybar-copy">
            <span className="ybar-title">{label}</span>
            {amounts}
            {othersNode}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`ybar ${style.cls}${done ? " ybar-done" : ""}${compact ? " ybar-compact" : ""}`}
      style={css}
    >
      <span className="ybar-deco" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      {!compact && (
        <div className="ybar-head">
          <span className="ybar-title">{label}</span>
          {amounts}
        </div>
      )}

      <div className="ybar-track">
        <div className="ybar-fill">
          <i className="ybar-fill-edge" />
        </div>
      </div>

      <div className="ybar-foot">
        {showPct ? (
          <span className="ybar-percent">{pctText}</span>
        ) : (
          <span className="ybar-percent">цель не задана</span>
        )}
        {othersNode}
      </div>
    </div>
  );
}
