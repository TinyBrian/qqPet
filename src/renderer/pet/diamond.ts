// 钻石 (#75): the free premium currency that replaces the original's Q币. Earned, never bought with real money.

/** 粉钻: 10 钻石 a month (30 days). */
export const PD_MONTH_DAYS = 30
export const PD_MONTH_PRICE = 10
/** 贴心宝贝: 1 钻石 looks after the pet for 3 days. */
export const SWEET_DAYS_PER_DIAMOND = 3

/** 钻石 for `months` of 粉钻; 12 months is the yearly membership. */
export const pinkCost = (months: number): number => Math.max(0, Math.floor(months)) * PD_MONTH_PRICE
/** 贴心宝贝 days bought with `n` 钻石. */
export const sweetDays = (n: number): number => Math.max(0, Math.floor(n)) * SWEET_DAYS_PER_DIAMOND
/** 粉钻 days for `months`: 12 months are a full year, so the yearly flag is set. */
export const pinkDays = (months: number): number => (months >= 12 ? 365 * Math.floor(months / 12) + PD_MONTH_DAYS * (months % 12) : PD_MONTH_DAYS * months)
