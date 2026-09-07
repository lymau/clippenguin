import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  hoverable?: boolean;
}

export function Card({ title, description, actions, hoverable, children, className, ...rest }: CardProps) {
  const classes = ["card", hoverable ? "card--hoverable" : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <div className={classes} {...rest}>
      {title ? <h2 className="card__title">{title}</h2> : null}
      {description ? <p className="card__text">{description}</p> : null}
      {children}
      {actions ? <div className="card__actions">{actions}</div> : null}
    </div>
  );
}
