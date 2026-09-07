// measures.js — the axis catalogue. Loaded by the ETL (node) AND the browser,
// so what the map offers and what the pipeline fetches can never disagree.
//
// THE DESIGN RULE THAT MAKES HIERARCHIES WORK:
//
//   Only EXTENSIVE quantities are stored. Everything intensive is derived.
//
// A stock (personal income, population, jobs, births) adds up. A rate (income
// per head, the transfer share, GDP per job) does NOT: the per-capita income of
// a region is not the mean of its counties' per-capita incomes, it is the
// region's income divided by the region's population, and the difference
// between those two numbers is large and systematically favours empty places.
// Storing only stocks and deriving every rate at the level being displayed
// makes that mistake impossible to make — county, metro, state, superstate and
// nation all compute the same way from the same definition.
//
// Each derived measure names its numerator and denominator, so the rollup code
// never has to know what anything means.

/* global globalThis */
(function (root) {
  'use strict';

  // --------------------------------------------------------------- stocks --
  // key: [label, unit, source, note]
  const STOCKS = {
    pop:                        ['Population', 'people', 'bea-regional'],
    income:                     ['Personal income', '$ thousands', 'bea-regional'],
    earnings:                   ['Earnings by place of work', '$ thousands', 'bea-regional'],
    wages:                      ['Wages and salaries', '$ thousands', 'bea-regional'],
    proprietors:                ['Proprietors’ income', '$ thousands', 'bea-regional'],
    dividends:                  ['Dividends, interest and rent', '$ thousands', 'bea-regional'],
    transfers:                  ['Personal current transfer receipts', '$ thousands', 'bea-regional'],
    income_maintenance:         ['Income maintenance benefits', '$ thousands', 'bea-regional'],
    unemployment_ins:           ['Unemployment insurance compensation', '$ thousands', 'bea-regional'],
    retirement_other:           ['Retirement and other transfers', '$ thousands', 'bea-regional'],
    farm_income:                ['Farm income', '$ thousands', 'bea-regional'],
    employment:                 ['Jobs (full- and part-time)', 'jobs', 'bea-regional'],
    employment_proprietors:     ['Proprietor jobs', 'jobs', 'bea-regional'],
    gdp:                        ['Gross domestic product', '$ thousands', 'bea-regional'],
    gdp_agriculture:            ['GDP — agriculture, forestry, fishing', '$ thousands', 'bea-regional'],
    gdp_mining:                 ['GDP — mining, quarrying, oil and gas', '$ thousands', 'bea-regional'],
    gdp_manufacturing:          ['GDP — manufacturing', '$ thousands', 'bea-regional'],
    gdp_finance:                ['GDP — finance, insurance, real estate', '$ thousands', 'bea-regional'],
    gdp_professional:           ['GDP — professional and business services', '$ thousands', 'bea-regional'],
    gdp_eds_health:             ['GDP — education and health', '$ thousands', 'bea-regional'],
    gdp_government:             ['GDP — government', '$ thousands', 'bea-regional'],
    births:                     ['Births', 'people', 'census-pep'],
    deaths:                     ['Deaths', 'people', 'census-pep'],
    net_domestic_migration:     ['Net domestic migration', 'people', 'census-pep'],
    net_international_migration:['Net international migration', 'people', 'census-pep'],
    pop_census:                 ['Population (Census estimate)', 'people', 'census-pep'],
    migration_in:               ['Migrants in', 'people', 'irs-soi-migration'],
    migration_out:              ['Migrants out', 'people', 'irs-soi-migration'],
    migration_in_agi:           ['AGI arriving', '$ thousands', 'irs-soi-migration'],
    migration_out_agi:          ['AGI leaving', '$ thousands', 'irs-soi-migration'],
    // Canada — Statistics Canada publishes these directly, and the census
    // profile does not give the stocks to derive them from, so they are stored
    // as measured and marked `noRollup`: a provincial figure must come from
    // Statistics Canada, not from averaging census divisions.
    median_household_income:    ['Median household income (CAD, 2020)', 'CAD', 'statcan-census-profile'],
    mean_household_income:      ['Mean household income (CAD, 2020)', 'CAD', 'statcan-census-profile'],
    median_employment_income:   ['Median employment income (CAD, 2020)', 'CAD', 'statcan-census-profile'],
    median_age:                 ['Median age', 'years', 'statcan-census-profile'],
    employment_rate:            ['Employment rate', '%', 'statcan-census-profile'],
    unemployment_rate:          ['Unemployment rate', '%', 'statcan-census-profile'],
    low_income_rate:            ['Low income (LIM-AT) prevalence', '%', 'statcan-census-profile'],
    pop_density:                ['Population density', 'per km²', 'statcan-census-profile'],
    pop_change_pct:             ['Population change 2016–2021', '%', 'statcan-census-profile'],
    rucc:                       ['Rural-urban continuum code', '1–9', 'usda-ers-rucc'],
    // Mexico - INEGI publishes counts, which is exactly what this atlas wants:
    // every Mexican rate below is derived, at whatever level is on screen.
    pop_female:                 ['Female population', 'people', 'inegi-censo-2020'],
    pop_15plus:                 ['Population aged 15 and over', 'people', 'inegi-censo-2020'],
    labour_force:               ['Economically active population', 'people', 'inegi-censo-2020'],
    employed:                   ['Employed population', 'people', 'inegi-censo-2020'],
    unemployed:                 ['Unemployed population', 'people', 'inegi-censo-2020'],
    no_health_affiliation:      ['Population with no health-service affiliation', 'people', 'inegi-censo-2020'],
    indigenous_language_speakers: ['Speakers of an indigenous language', 'people', 'inegi-censo-2020'],
    dwellings:                  ['Occupied private dwellings', 'dwellings', 'inegi-censo-2020'],
    dwellings_internet:         ['Dwellings with an internet connection', 'dwellings', 'inegi-censo-2020'],
    dwellings_car:              ['Dwellings with a car', 'dwellings', 'inegi-censo-2020'],
    dwellings_dirt_floor:       ['Dwellings with an earth floor', 'dwellings', 'inegi-censo-2020'],
  };

  const NO_ROLLUP = new Set([
    'median_household_income', 'mean_household_income', 'median_employment_income',
    'median_age', 'employment_rate', 'unemployment_rate', 'low_income_rate',
    'pop_density', 'pop_change_pct', 'rucc',
  ]);

  // -------------------------------------------------------------- measures --
  //
  // `num`/`den` are stock keys; `k` scales the quotient into the stated unit
  // (BEA reports dollars in thousands, so income/pop needs ×1000 to be dollars
  // per person). `kind` picks the colour job: sequential for magnitude,
  // diverging for something with a meaningful zero or a national reference.

  const M = (o) => o;
  const MEASURES = [
    // ---- the money ----
    M({ key: 'pcpi', label: 'Per capita personal income', group: 'Income',
        num: 'income', den: 'pop', k: 1000, format: 'usd0', kind: 'sequential', axis: true,
        note: 'BEA personal income divided by BEA midyear population. Includes transfers and property income, so it is not a wage.' }),
    M({ key: 'rel_pcpi', label: 'Income relative to the national average', group: 'Income',
        num: 'income', den: 'pop', k: 1000, relativeToTotal: true, format: 'ratio', kind: 'diverging', center: 1, axis: true,
        note: 'Per capita income as a multiple of the same figure for the whole country. 1.00 is the national average, at every level of the hierarchy.' }),
    M({ key: 'earnings_per_job', label: 'Average earnings per job', group: 'Income',
        num: 'earnings', den: 'employment', k: 1000, format: 'usd0', kind: 'sequential', axis: true }),

    // ---- where the money comes from: the composition axes ----
    M({ key: 'wage_share', label: 'Share of income from wages', group: 'Composition',
        num: 'wages', den: 'income', format: 'pct1', kind: 'sequential', axis: true }),
    M({ key: 'transfer_share', label: 'Share of income from government transfers', group: 'Composition',
        num: 'transfers', den: 'income', format: 'pct1', kind: 'sequential', axis: true,
        note: 'Social Security, Medicare and Medicaid, veterans’ benefits, income maintenance. In several hundred counties this is over a third of all personal income.' }),
    M({ key: 'dir_share', label: 'Share of income from dividends, interest and rent', group: 'Composition',
        num: 'dividends', den: 'income', format: 'pct1', kind: 'sequential', axis: true,
        note: 'Property income. Maps the retirement coasts and the old-money counties in the same stroke.' }),
    M({ key: 'proprietor_share', label: 'Share of income from proprietors', group: 'Composition',
        num: 'proprietors', den: 'income', format: 'pct1', kind: 'diverging', center: 0, axis: true,
        note: 'Business-owner and farm income. Goes NEGATIVE in farm counties in bad years, which is why this one diverges around zero.' }),
    M({ key: 'farm_share', label: 'Share of income from farming', group: 'Composition',
        num: 'farm_income', den: 'income', format: 'pct1', kind: 'diverging', center: 0, axis: true }),
    M({ key: 'maintenance_share', label: 'Share of income from means-tested benefits', group: 'Composition',
        num: 'income_maintenance', den: 'income', format: 'pct1', kind: 'sequential', axis: true }),
    M({ key: 'retirement_share', label: 'Share of income from retirement benefits', group: 'Composition',
        num: 'retirement_other', den: 'income', format: 'pct1', kind: 'sequential', axis: true }),

    // ---- production ----
    M({ key: 'gdp_per_capita', label: 'GDP per resident', group: 'Production',
        num: 'gdp', den: 'pop', k: 1000, format: 'usd0', kind: 'sequential', axis: true }),
    M({ key: 'gdp_per_job', label: 'GDP per job', group: 'Production',
        num: 'gdp', den: 'employment', k: 1000, format: 'usd0', kind: 'sequential', axis: true,
        note: 'The closest thing to a county productivity measure in official statistics.' }),
    M({ key: 'jobs_per_capita', label: 'Jobs per resident', group: 'Production',
        num: 'employment', den: 'pop', format: 'ratio', kind: 'diverging', center: 0.5, axis: true,
        note: 'Above ~0.6 the county imports workers; below ~0.35 it exports them. A commuting map hiding inside an employment number.' }),
    M({ key: 'self_employment_share', label: 'Share of jobs that are proprietors', group: 'Production',
        num: 'employment_proprietors', den: 'employment', format: 'pct1', kind: 'sequential', axis: true }),
    M({ key: 'gdp_mining_share', label: 'GDP share — mining and energy', group: 'Production',
        num: 'gdp_mining', den: 'gdp', format: 'pct1', kind: 'sequential', axis: true }),
    M({ key: 'gdp_manufacturing_share', label: 'GDP share — manufacturing', group: 'Production',
        num: 'gdp_manufacturing', den: 'gdp', format: 'pct1', kind: 'sequential', axis: true }),
    M({ key: 'gdp_finance_share', label: 'GDP share — finance and real estate', group: 'Production',
        num: 'gdp_finance', den: 'gdp', format: 'pct1', kind: 'sequential', axis: true }),
    M({ key: 'gdp_government_share', label: 'GDP share — government', group: 'Production',
        num: 'gdp_government', den: 'gdp', format: 'pct1', kind: 'sequential', axis: true }),
    M({ key: 'gdp_eds_health_share', label: 'GDP share — education and health', group: 'Production',
        num: 'gdp_eds_health', den: 'gdp', format: 'pct1', kind: 'sequential', axis: true }),

    // ---- people, and whether they are staying ----
    M({ key: 'natural_increase_rate', label: 'Natural increase, per 1,000 residents', group: 'Demography',
        num: 'births', den: 'pop_census', k: 1000, minus: 'deaths', format: 'index', kind: 'diverging', center: 0, axis: true,
        note: 'Births minus deaths over the vintage window. Negative across most of rural America — the deaths outnumber the births before anybody moves anywhere.' }),
    M({ key: 'domestic_migration_rate', label: 'Net domestic migration, per 1,000 residents', group: 'Demography',
        num: 'net_domestic_migration', den: 'pop_census', k: 1000, format: 'index', kind: 'diverging', center: 0, axis: true,
        note: 'Americans moving between counties. The nearest thing to a national referendum held every year with feet.' }),
    M({ key: 'international_migration_rate', label: 'Net international migration, per 1,000 residents', group: 'Demography',
        num: 'net_international_migration', den: 'pop_census', k: 1000, format: 'index', kind: 'sequential', axis: true }),
    M({ key: 'churn_rate', label: 'Migration churn, share of residents moving in or out', group: 'Demography',
        num: 'migration_in', plus: 'migration_out', den: 'pop', format: 'pct1', kind: 'sequential', axis: true,
        note: 'From tax returns: everyone who arrived plus everyone who left, over population. High churn and low net change is a very different place from low churn.' }),
    M({ key: 'mover_income_ratio', label: 'Income of arrivals vs leavers', group: 'Demography',
        ratioOfRatios: [['migration_in_agi', 'migration_in'], ['migration_out_agi', 'migration_out']],
        format: 'ratio', kind: 'diverging', center: 1, axis: true,
        note: 'Adjusted gross income per arriving person divided by the same for leavers. Above 1 the county is trading up; below 1 it is being drained of income even when the headcount holds.' }),

    // ---- Mexico. A separate group because these are not the same questions ----
    // Asking a Mexican municipio for its transfer share, or a U.S. county for
    // its share of dwellings with an earth floor, would be a category error in
    // both directions. Each country gets the axes its statistical agency
    // actually measures, and the map shows the group that applies.
    M({ key: 'mx_labour_participation', label: 'Labour-force participation', group: 'Mexico',
        num: 'labour_force', den: 'pop_15plus', format: 'pct1', kind: 'sequential', axis: true, nation: 'MX' }),
    M({ key: 'mx_unemployment', label: 'Unemployment rate', group: 'Mexico',
        num: 'unemployed', den: 'labour_force', format: 'pct1', kind: 'sequential', axis: true, nation: 'MX' }),
    M({ key: 'mx_no_health', label: 'Share with no health-service affiliation', group: 'Mexico',
        num: 'no_health_affiliation', den: 'pop', format: 'pct1', kind: 'sequential', axis: true, nation: 'MX' }),
    M({ key: 'mx_indigenous', label: 'Share speaking an indigenous language', group: 'Mexico',
        num: 'indigenous_language_speakers', den: 'pop', format: 'pct1', kind: 'sequential', axis: true, nation: 'MX',
        note: 'Sixty-eight recognised language families, and the map of them is one of the sharpest regional boundaries on this continent.' }),
    M({ key: 'mx_internet', label: 'Dwellings with an internet connection', group: 'Mexico',
        num: 'dwellings_internet', den: 'dwellings', format: 'pct1', kind: 'sequential', axis: true, nation: 'MX' }),
    M({ key: 'mx_car', label: 'Dwellings with a car', group: 'Mexico',
        num: 'dwellings_car', den: 'dwellings', format: 'pct1', kind: 'sequential', axis: true, nation: 'MX' }),
    M({ key: 'mx_dirt_floor', label: 'Dwellings with an earth floor', group: 'Mexico',
        num: 'dwellings_dirt_floor', den: 'dwellings', format: 'pct1', kind: 'sequential', axis: true, nation: 'MX' }),

    // ---- Canada. Statistics Canada publishes these as rates, so they cannot ----
    // be rolled up past the census division; hier.js refuses rather than
    // averaging medians.
    M({ key: 'ca_median_household_income', label: 'Median household income (CAD, 2020)', group: 'Canada',
        stock: 'median_household_income', format: 'usd0', kind: 'sequential', nation: 'CA' }),
    M({ key: 'ca_median_employment_income', label: 'Median employment income (CAD, 2020)', group: 'Canada',
        stock: 'median_employment_income', format: 'usd0', kind: 'sequential', nation: 'CA' }),
    M({ key: 'ca_employment_rate', label: 'Employment rate', group: 'Canada',
        stock: 'employment_rate', format: 'pct', kind: 'sequential', nation: 'CA' }),
    M({ key: 'ca_unemployment_rate', label: 'Unemployment rate', group: 'Canada',
        stock: 'unemployment_rate', format: 'pct', kind: 'sequential', nation: 'CA' }),
    M({ key: 'ca_low_income_rate', label: 'Low income (LIM-AT) prevalence', group: 'Canada',
        stock: 'low_income_rate', format: 'pct', kind: 'sequential', nation: 'CA' }),
    M({ key: 'ca_median_age', label: 'Median age', group: 'Canada',
        stock: 'median_age', format: 'index', kind: 'sequential', nation: 'CA' }),
    M({ key: 'ca_pop_change', label: 'Population change, 2016 to 2021', group: 'Canada',
        stock: 'pop_change_pct', format: 'pct', kind: 'diverging', center: 0, nation: 'CA' }),
  ];

  // The first four groups are built out of BEA / Census / IRS stocks, which
  // exist only for the United States. Tagging them here rather than on each
  // entry keeps the catalogue readable and keeps the rule in one place: a
  // measure belongs to the nation whose statistical agency measures it.
  const US_GROUPS = new Set(['Income', 'Composition', 'Production', 'Demography']);
  for (const m of MEASURES) if (!m.nation && US_GROUPS.has(m.group)) m.nation = 'US';

  const BY_KEY = Object.fromEntries(MEASURES.map((m) => [m.key, m]));
  const GROUPS = [...new Set(MEASURES.map((m) => m.group))];
  const AXES = MEASURES.filter((m) => m.axis);
  /** Measures a nation's own statistical agency actually publishes. */
  const forNation = (iso) => MEASURES.filter((m) => !m.nation || m.nation === iso);

  const API = { STOCKS, NO_ROLLUP, MEASURES, BY_KEY, GROUPS, AXES, forNation };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ATLAS_MEASURES = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
