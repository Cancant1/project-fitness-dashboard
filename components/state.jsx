/* global React */
// App-wide state — profiles, macro targets per day. Persisted to localStorage.
const { createContext, useState, useEffect, useContext, useRef } = React;

const PHASES = {
  "cut-1":      { label: "Aggressive cut · -1.0 kg/wk",   rate: -1.0,  kcalDelta: -1100 },
  "cut-0.75":   { label: "Hard cut · -0.75 kg/wk",        rate: -0.75, kcalDelta: -825  },
  "cut-0.5":    { label: "Standard cut · -0.5 kg/wk",     rate: -0.5,  kcalDelta: -550  },
  "cut-0.25":   { label: "Mini cut · -0.25 kg/wk",        rate: -0.25, kcalDelta: -275  },
  "maintain":   { label: "Maintain",                       rate: 0,     kcalDelta: 0     },
  "bulk-0.25":  { label: "Lean bulk · +0.25 kg/wk",       rate: 0.25,  kcalDelta: 275   },
  "bulk-0.5":   { label: "Standard bulk · +0.5 kg/wk",    rate: 0.5,   kcalDelta: 550   },
  "bulk-0.75":  { label: "Hard bulk · +0.75 kg/wk",       rate: 0.75,  kcalDelta: 825   },
  "bulk-1":     { label: "Aggressive bulk · +1.0 kg/wk",  rate: 1.0,   kcalDelta: 1100  }
};

const STORE_KEY = "reps-app-state-v1";
const SYNC_CONFIG_KEY = "reps-github-sync-config-v1";
const SYNC_META_KEY = "reps-github-sync-meta-v1";
const SYNC_APP_ID = "reps-dashboard";
const SYNC_SCHEMA_VERSION = 1;

const DAY_KEYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const DEFAULT_PROGRESSION_RULES = {
  compound: {
    label: "Compound",
    trigger: "first_set_top_final_in_range",
    incrementKg: 2.5,
    incrementLbs: 5,
    repDropWarningPct: 30
  },
  hypertrophy: {
    label: "Hypertrophy",
    trigger: "all_sets_top",
    incrementKg: 2.5,
    incrementLbs: 5,
    repDropWarningPct: 30
  },
  safety: {
    label: "Safety",
    trigger: "hold_if_final_drops",
    incrementKg: 0,
    incrementLbs: 0,
    repDropWarningPct: 30
  }
};
const PROGRESSION_RULE_TRIGGERS = ["first_set_top_final_in_range", "all_sets_top", "hold_if_final_drops"];

const DEFAULT_HOB_PREFERENCES = {
  scale: [
    { range: "1-4", label: "low heat" },
    { range: "5", label: "medium-low" },
    { range: "6", label: "medium" },
    { range: "7", label: "medium-high" },
    { range: "8-9", label: "high" }
  ],
  usualRange: "5-7",
  note: "Electric hob: 1-4 low, 5 medium-low, 6 medium, 7 medium-high, 8-9 high."
};

const STARTER_RECIPE_ID = "recipe-potato-meat-veg-classic-burgers";
const STARTER_RECIPE = {
  id: STARTER_RECIPE_ID,
  name: "Potatoes, broccoli, gravy and burgers",
  category: "Dinner",
  tags: ["potato-meat-vegetable", "Jumbo", "electric hob"],
  servings: 1,
  summary: "A normal-plus potato, vegetable and fresh meat dinner with adjustable Jumbo meat and vegetable options.",
  defaultDateMode: "today",
  selections: {
    meat: "jumbo-classic-burger",
    starch: "jumbo-vastkokende-aardappelen",
    vegetable: "jumbo-bio-broccoli",
    sauce: "maggi-jus-naturel",
    fat: "jumbo-zonnebloemolie"
  },
  groups: [
    {
      id: "meat",
      label: "Meat",
      inputLabel: "grams",
      options: [
        {
          id: "jumbo-classic-burger",
          label: "Jumbo Classic Burger Rundvlees",
          item: "Jumbo Classic Burger Rundvlees 2 Stuks",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-classic-burger-rundvlees-2-stuks-95544TRA",
          packAmount: 220,
          packUnit: "g",
          packPrice: 4.05,
          currency: "EUR",
          amount: 220,
          amountUnit: "g",
          displayAmount: "2 burgers",
          nutritionBasis: "per 100 g",
          kcalPer100: 235,
          proteinPer100: 14.5,
          carbsPer100: 2.3,
          fatPer100: 18.6
        },
        {
          id: "jumbo-ambachtelijke-slavink",
          label: "Jumbo Ambachtelijke Slavink",
          item: "Jumbo Ambachtelijke Slavinken 2 Stuks",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-ambachtelijke-slavinken-2-stuks-201573TRA",
          packAmount: 220,
          packUnit: "g",
          packPrice: 2.79,
          currency: "EUR",
          amount: 110,
          amountUnit: "g",
          displayAmount: "1 slavink",
          nutritionBasis: "per 100 g",
          kcalPer100: 273,
          proteinPer100: 15.2,
          carbsPer100: 0.7,
          fatPer100: 23.2
        },
        {
          id: "jumbo-varken-saucijs",
          label: "Jumbo Varken Saucijs",
          item: "Jumbo Varkens Saucijzen 10 Stuks",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-varkens-saucijzen-10-stuks-163322TRA",
          packAmount: 800,
          packUnit: "g",
          packPrice: 6.19,
          currency: "EUR",
          amount: 120,
          amountUnit: "g",
          displayAmount: "1.5 saucijzen",
          nutritionBasis: "per 100 g",
          kcalPer100: 280,
          proteinPer100: 17.1,
          carbsPer100: 0.5,
          fatPer100: 23.2
        }
      ]
    },
    {
      id: "starch",
      label: "Potatoes",
      inputLabel: "grams",
      options: [
        {
          id: "jumbo-vastkokende-aardappelen",
          label: "Jumbo Vastkokende Aardappelen",
          item: "Jumbo Vastkokende Aardappelen 1 kg",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-vastkokende-aardappelen-1kg-74155ZK",
          packAmount: 1000,
          packUnit: "g",
          packPrice: 1.29,
          currency: "EUR",
          amount: 200,
          amountUnit: "g",
          displayAmount: "200 g",
          nutritionBasis: "per 100 g",
          kcalPer100: 86,
          proteinPer100: 1.7,
          carbsPer100: 17.9,
          fatPer100: 0.4
        }
      ]
    },
    {
      id: "vegetable",
      label: "Vegetable",
      inputLabel: "grams",
      options: [
        {
          id: "jumbo-bio-broccoli",
          label: "Jumbo Biologische Broccoliroosjes",
          item: "Jumbo Biologische Broccoliroosjes 450 g",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-biologische-broccoliroosjes-450-g-620066ZK",
          packAmount: 450,
          packUnit: "g",
          packPrice: 2.58,
          currency: "EUR",
          amount: 225,
          amountUnit: "g",
          displayAmount: "half a 450 g bag",
          nutritionBasis: "per 100 g",
          kcalPer100: 38,
          proteinPer100: 3.3,
          carbsPer100: 2.3,
          fatPer100: 0.9
        },
        {
          id: "jumbo-bio-sperziebonen",
          label: "Jumbo Biologische Hele Sperziebonen",
          item: "Jumbo Biologisch Hele Sperziebonen 450 g",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-biologisch-hele-sperziebonen-450g-621516ZK",
          packAmount: 450,
          packUnit: "g",
          packPrice: 1.35,
          currency: "EUR",
          amount: 225,
          amountUnit: "g",
          displayAmount: "half a 450 g bag",
          nutritionBasis: "per 100 g",
          kcalPer100: 34,
          proteinPer100: 1.8,
          carbsPer100: 5.4,
          fatPer100: 0.1
        },
        {
          id: "jumbo-bio-bladspinazie",
          label: "Jumbo Biologische Bladspinazie",
          item: "Jumbo Biologische Bladspinazie 450 g",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-biologisch-bladspinazie-gesneden-450-g-632203DS",
          packAmount: 450,
          packUnit: "g",
          packPrice: 1.39,
          currency: "EUR",
          amount: 225,
          amountUnit: "g",
          displayAmount: "half a 450 g bag",
          nutritionBasis: "per 100 g",
          kcalPer100: 24,
          proteinPer100: 2.3,
          carbsPer100: 1.7,
          fatPer100: 0.4
        }
      ]
    },
    {
      id: "sauce",
      label: "Gravy",
      inputLabel: "ml",
      options: [
        {
          id: "maggi-jus-naturel",
          label: "Maggi Jus Naturel",
          item: "Maggi Jus Naturel 250 ml",
          sourceUrl: "https://www.jumbo.com/producten/maggi-jus-naturel-250-ml-703835PAK",
          packAmount: 250,
          packUnit: "ml",
          packPrice: 2.59,
          currency: "EUR",
          amount: 50,
          amountUnit: "ml",
          displayAmount: "50 ml",
          nutritionBasis: "per 100 ml",
          kcalPer100: 31,
          proteinPer100: 0.5,
          carbsPer100: 5,
          fatPer100: 0
        }
      ]
    },
    {
      id: "fat",
      label: "Cooking fat",
      inputLabel: "ml",
      options: [
        {
          id: "jumbo-zonnebloemolie",
          label: "Jumbo Zonnebloemolie",
          item: "Jumbo Zonnebloemolie 500 ml",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-zonnebloemolie-500ml-269994FLS",
          packAmount: 500,
          packUnit: "ml",
          packPrice: 3.99,
          currency: "EUR",
          amount: 7.5,
          amountUnit: "ml",
          displayAmount: "0.5 el share from 1 el for 4 burgers",
          nutritionBasis: "per 100 ml",
          kcalPer100: 828,
          proteinPer100: 0,
          carbsPer100: 0,
          fatPer100: 92
        }
      ]
    }
  ],
  cooking: {
    equipment: "Electric hob",
    hobNote: DEFAULT_HOB_PREFERENCES.note,
    steps: [
      { id: "potatoes", title: "Potatoes", hob: "8-9 then 6", minutes: "15-20", body: "Start peeled or washed potatoes in cold salted water. Bring to a boil on 8-9, lower to 6, cook until tender, then drain and steam dry." },
      { id: "vegetable", title: "Vegetable", hob: "7 then 5-6", minutes: "5-7", body: "Cook frozen broccoli or the selected frozen vegetable with a small amount of water. Bring up on 7, hold on 5-6 until hot and tender, then drain." },
      { id: "meat", title: "Meat", hob: "7 then 6-7", minutes: "6-12", body: "Heat the pan on 7. Add the recipe's oil share. For burgers, cook about 3-4 minutes per side on 6-7 and lower to 5 if browning too fast. For sausages or slavinken, brown briefly, then finish on 5-6 until cooked through." },
      { id: "gravy", title: "Gravy", hob: "5", minutes: "2-3", body: "Warm the gravy on 5 while the meat rests. Stir occasionally and serve over the potatoes or beside the meat." }
    ]
  },
  createdAt: "2026-06-05T00:00:00.000Z",
  updatedAt: "2026-06-05T14:30:00.000Z"
};

const PASTA_RECIPE_ID = "recipe-pastaschotel-kip-rode-pesto";
const PASTA_RECIPE = {
  id: PASTA_RECIPE_ID,
  name: "Pastaschotel met kip en rode pesto",
  category: "Dinner",
  tags: ["pasta", "oven", "Jumbo", "electric hob"],
  servings: 1,
  summary: "A two-person oven pasta bake with chicken, red pesto, cooking cream and mozzarella.",
  defaultDateMode: "today",
  selections: {
    pasta: "jumbo-penne-rigate",
    meat: "jumbo-kipfiletblokjes",
    soupVegetables: "jumbo-soepgroenten-diepvries",
    redPepper: "jumbo-paprika-rood",
    yellowPepper: "jumbo-paprika-geel",
    garlic: "jumbo-bio-knoflook",
    sauce: "jumbo-pesto-rood",
    cream: "jumbo-kookroom-20",
    topping: "jumbo-geraspte-mozzarella",
    fat: "jumbo-olijfolie-mild",
    chickenSeasoning: "jumbo-kruidenmix-kip",
    herb: "euroma-oregano"
  },
  groups: [
    {
      id: "pasta",
      label: "Pasta",
      inputLabel: "grams",
      options: [
        {
          id: "jumbo-penne-rigate",
          label: "Jumbo's Penne Rigate",
          item: "Jumbo's Penne Rigate 500 g",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-s-penne-rigate-500-g-710326ZK",
          packAmount: 500,
          packUnit: "g",
          packPrice: 1.29,
          currency: "EUR",
          amount: 150,
          amountUnit: "g",
          displayAmount: "150 g dry pasta",
          nutritionBasis: "per 100 g",
          kcalPer100: 374,
          proteinPer100: 13.5,
          carbsPer100: 75,
          fatPer100: 1.5
        }
      ]
    },
    {
      id: "meat",
      label: "Chicken",
      inputLabel: "grams",
      options: [
        {
          id: "jumbo-kipfiletblokjes",
          label: "Jumbo Kipfiletblokjes",
          item: "Jumbo Kipfiletblokjes 600 g",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-kipfiletblokjes-600-g-515014BAK",
          packAmount: 600,
          packUnit: "g",
          packPrice: 8.49,
          currency: "EUR",
          amount: 150,
          amountUnit: "g",
          displayAmount: "150 g",
          nutritionBasis: "per 100 g",
          kcalPer100: 106,
          proteinPer100: 24.7,
          carbsPer100: 0,
          fatPer100: 0.8
        }
      ]
    },
    {
      id: "soupVegetables",
      label: "Soup vegetables",
      inputLabel: "grams",
      options: [
        {
          id: "jumbo-soepgroenten-diepvries",
          label: "Jumbo Soepgroenten",
          item: "Jumbo Soepgroenten 450 g",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-soepgroenten-450g-600670DS",
          packAmount: 450,
          packUnit: "g",
          packPrice: 1.93,
          currency: "EUR",
          amount: 200,
          amountUnit: "g",
          displayAmount: "200 g frozen",
          nutritionBasis: "per 100 g",
          kcalPer100: 27,
          proteinPer100: 1.5,
          carbsPer100: 3,
          fatPer100: 0.5
        }
      ]
    },
    {
      id: "redPepper",
      label: "Red pepper",
      inputLabel: "grams",
      options: [
        {
          id: "jumbo-paprika-rood",
          label: "Jumbo Paprika Rood",
          item: "Jumbo Paprika Rood 1 stuk",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-paprika-rood-641085STK",
          packAmount: 150,
          packUnit: "g",
          packPrice: 1.09,
          currency: "EUR",
          amount: 75,
          amountUnit: "g",
          displayAmount: "half a pepper",
          nutritionBasis: "per 100 g estimate",
          kcalPer100: 31,
          proteinPer100: 1,
          carbsPer100: 6,
          fatPer100: 0.3
        }
      ]
    },
    {
      id: "yellowPepper",
      label: "Yellow pepper",
      inputLabel: "grams",
      options: [
        {
          id: "jumbo-paprika-geel",
          label: "Jumbo Paprika Geel",
          item: "Jumbo Paprika Geel 1 stuk",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-paprika-geel-719402STK",
          packAmount: 150,
          packUnit: "g",
          packPrice: 1.09,
          currency: "EUR",
          amount: 75,
          amountUnit: "g",
          displayAmount: "half a pepper",
          nutritionBasis: "per 100 g estimate",
          kcalPer100: 27,
          proteinPer100: 1,
          carbsPer100: 6.3,
          fatPer100: 0.2
        }
      ]
    },
    {
      id: "garlic",
      label: "Garlic",
      inputLabel: "grams",
      options: [
        {
          id: "jumbo-bio-knoflook",
          label: "Jumbo Biologische Knoflook",
          item: "Jumbo Biologische Knoflook 2 Stuks",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-knoflook-biologisch-100g-191136NET",
          packAmount: 100,
          packUnit: "g",
          packPrice: 1.49,
          currency: "EUR",
          amount: 5,
          amountUnit: "g",
          displayAmount: "1 small clove",
          nutritionBasis: "per 100 g estimate",
          kcalPer100: 149,
          proteinPer100: 6.4,
          carbsPer100: 33.1,
          fatPer100: 0.5
        }
      ]
    },
    {
      id: "sauce",
      label: "Pesto",
      inputLabel: "grams",
      options: [
        {
          id: "jumbo-pesto-rood",
          label: "Jumbo Pesto Rood",
          item: "Jumbo Pesto Rood 190 g",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-pesto-rood-190g-347553POT",
          packAmount: 190,
          packUnit: "g",
          packPrice: 1.13,
          currency: "EUR",
          amount: 100,
          amountUnit: "g",
          displayAmount: "100 g",
          nutritionBasis: "per 100 g",
          kcalPer100: 358,
          proteinPer100: 6.5,
          carbsPer100: 9.1,
          fatPer100: 32
        },
        {
          id: "sacla-pesto-rosso",
          label: "Sacla Pesto Rosso",
          item: "Sacla Pesto Rosso 190 g",
          sourceUrl: "https://www.jumbo.com/producten/sacla-pesto-rosso-190g-80387DS",
          packAmount: 190,
          packUnit: "g",
          packPrice: 2.66,
          currency: "EUR",
          amount: 100,
          amountUnit: "g",
          displayAmount: "100 g",
          nutritionBasis: "per 100 g",
          kcalPer100: 312,
          proteinPer100: 4.3,
          carbsPer100: 5.6,
          fatPer100: 29.3
        }
      ]
    },
    {
      id: "cream",
      label: "Cooking cream",
      inputLabel: "ml",
      options: [
        {
          id: "jumbo-kookroom-20",
          label: "Jumbo Kookroom 20%",
          item: "Jumbo Kookroom 20% Vet 250 ml",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-kookroom-20-vet-250-ml-189102STK",
          packAmount: 250,
          packUnit: "ml",
          packPrice: 0.98,
          currency: "EUR",
          amount: 75,
          amountUnit: "ml",
          displayAmount: "75 ml, up to 100 ml if dry",
          nutritionBasis: "per 100 ml",
          kcalPer100: 207,
          proteinPer100: 2.6,
          carbsPer100: 4.2,
          fatPer100: 20
        }
      ]
    },
    {
      id: "topping",
      label: "Cheese",
      inputLabel: "grams",
      options: [
        {
          id: "jumbo-geraspte-mozzarella",
          label: "Jumbo Geraspte Mozzarella 40+",
          item: "Jumbo Geraspte Mozzarella 40+ 150 g",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-geraspte-mozzarella-40-150-g-588986ZK",
          packAmount: 150,
          packUnit: "g",
          packPrice: 2.49,
          currency: "EUR",
          amount: 50,
          amountUnit: "g",
          displayAmount: "50 g",
          nutritionBasis: "per 100 g",
          kcalPer100: 303,
          proteinPer100: 25,
          carbsPer100: 2.7,
          fatPer100: 21
        }
      ]
    },
    {
      id: "fat",
      label: "Cooking fat",
      inputLabel: "ml",
      options: [
        {
          id: "jumbo-olijfolie-mild",
          label: "Jumbo Olijfolie Mild",
          item: "Jumbo Olijfolie Mild 500 ml",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-olijfolie-mild-500-ml-418263FLS",
          packAmount: 500,
          packUnit: "ml",
          packPrice: 5.45,
          currency: "EUR",
          amount: 15,
          amountUnit: "ml",
          displayAmount: "1 el plus a little for the dish",
          nutritionBasis: "per 100 ml",
          kcalPer100: 823,
          proteinPer100: 0,
          carbsPer100: 0,
          fatPer100: 91.4
        }
      ]
    },
    {
      id: "chickenSeasoning",
      label: "Chicken seasoning",
      inputLabel: "grams",
      options: [
        {
          id: "jumbo-kruidenmix-kip",
          label: "Jumbo Kruidenmix Kip",
          item: "Jumbo Kruidenmix Kip 70 g",
          sourceUrl: "https://www.jumbo.com/producten/jumbo-kruidenmix-kip-70g-562156POT",
          packAmount: 70,
          packUnit: "g",
          packPrice: 1.94,
          currency: "EUR",
          amount: 3,
          amountUnit: "g",
          displayAmount: "1 tsp",
          nutritionBasis: "per 100 g",
          kcalPer100: 191,
          proteinPer100: 6.9,
          carbsPer100: 16.9,
          fatPer100: 6.7
        }
      ]
    },
    {
      id: "herb",
      label: "Oregano",
      inputLabel: "grams",
      options: [
        {
          id: "euroma-oregano",
          label: "Euroma Oregano",
          item: "Euroma Essential N04 Oregano",
          sourceUrl: "https://www.jumbo.com/producten/euroma-essential-n04-oregano-619973BLK",
          packAmount: 5,
          packUnit: "g",
          packPrice: 3.14,
          currency: "EUR",
          amount: 0.75,
          amountUnit: "g",
          displayAmount: "0.75 tsp",
          nutritionBasis: "per 100 g estimate",
          kcalPer100: 306,
          proteinPer100: 11,
          carbsPer100: 64,
          fatPer100: 10
        }
      ]
    }
  ],
  cooking: {
    equipment: "Electric hob and oven",
    hobNote: DEFAULT_HOB_PREFERENCES.note,
    steps: [
      { id: "oven", title: "Oven and dish", hob: "oven 180 C", minutes: "5", body: "Preheat the oven to 180 C. Lightly grease an oven dish with a small amount of olive oil." },
      { id: "pasta", title: "Pasta", hob: "8-9 then 6", minutes: "8-11", body: "Cook the penne according to the package. Drain and keep it aside." },
      { id: "chicken", title: "Chicken", hob: "7", minutes: "4-6", body: "Heat 1 tablespoon olive oil in a large frying pan or saute pan on 7. Cook the chicken cubes until the outside is white and lightly browned. Add the chicken seasoning and cook briefly." },
      { id: "garlic", title: "Garlic", hob: "5-6", minutes: "0.5-1", body: "Lower the hob to 5-6. Add minced or pressed garlic and cook for 30-60 seconds without letting it burn." },
      { id: "vegetables", title: "Vegetables", hob: "7 then 6-7", minutes: "12-15", body: "Add the frozen soup vegetables and diced red and yellow pepper. Bring the pan back up on 7, then cook on 6-7 until the frozen moisture has evaporated and the mixture is not soupy." },
      { id: "season", title: "Season", hob: "6", minutes: "1", body: "Season with oregano, salt and pepper. Stir the cooked pasta through the chicken and vegetables." },
      { id: "sauce", title: "Sauce", hob: "5", minutes: "1-2", body: "Lower to 5. Stir in the red pesto and 75 ml cooking cream. Add up to 100 ml cooking cream if the mixture looks dry." },
      { id: "bake", title: "Bake", hob: "oven 180 C", minutes: "20", body: "Transfer everything to the oven dish, top with grated mozzarella and bake for about 20 minutes until the cheese has melted and the top has light colour." },
      { id: "rest", title: "Rest", hob: "off", minutes: "2-3", body: "Let the dish stand for 2-3 minutes before serving so the sauce settles slightly." }
    ]
  },
  createdAt: "2026-06-05T14:30:00.000Z",
  updatedAt: "2026-06-05T14:30:00.000Z"
};

const DEFAULT_RECIPE_SEEDS = [STARTER_RECIPE, PASTA_RECIPE];

function progressionRulesWithDefaults(rules = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_PROGRESSION_RULES).map(([key, defaults]) => {
    const current = rules?.[key] || {};
    const trigger = PROGRESSION_RULE_TRIGGERS.includes(current.trigger) ? current.trigger : defaults.trigger;
    return [key, {
      ...defaults,
      ...current,
      trigger,
      label: String(current.label || defaults.label).trim() || defaults.label,
      incrementKg: Number.isFinite(Number(current.incrementKg)) ? Number(current.incrementKg) : defaults.incrementKg,
      incrementLbs: Number.isFinite(Number(current.incrementLbs)) ? Number(current.incrementLbs) : defaults.incrementLbs,
      repDropWarningPct: Number.isFinite(Number(current.repDropWarningPct)) ? Number(current.repDropWarningPct) : defaults.repDropWarningPct
    }];
  }));
}

const DEFAULT_STATE = {
  activeProfileId: "local",
  profiles: [
    {
      id: "local",
      name: "Profile",
      birthday: "",
      unit: "kg",
      hasHistory: false,
      macros: {
        Mon: { kcal: 2700, protein: 180, carbs: 280, fat: 85 },
        Tue: { kcal: 2700, protein: 180, carbs: 280, fat: 85 },
        Wed: { kcal: 2700, protein: 180, carbs: 280, fat: 85 },
        Thu: { kcal: 2700, protein: 180, carbs: 280, fat: 85 },
        Fri: { kcal: 2700, protein: 180, carbs: 280, fat: 85 },
        Sat: { kcal: 2700, protein: 180, carbs: 280, fat: 85 },
        Sun: { kcal: 2700, protein: 180, carbs: 280, fat: 85 }
      },
      preset: "maintain",
      phase: "maintain",
      targetWeight: null,
      progressionRules: progressionRulesWithDefaults(),
      foodByDate: {},        // { "2026-05-21": [{id, product, kcal, protein, amount}, ...] }
      foodCatalogOverrides: {},
      foodCatalogOrder: [],
      recipes: [],
      deletedRecipes: {},
      cookingPreferences: { hob: DEFAULT_HOB_PREFERENCES },
      customExercises: [],   // { id, name, group, equipment, unit, notes }
      hiddenExercises: []    // historical exercise names hidden from the database view
    }
  ]
};

const PRESETS = {
  cut: {
    label: "Cut",
    desc: "Lower kcal training days, deeper deficit on rest",
    macros: {
      Mon: { kcal: 2400, protein: 180, carbs: 230, fat: 75 },
      Tue: { kcal: 2400, protein: 180, carbs: 230, fat: 75 },
      Wed: { kcal: 2400, protein: 180, carbs: 230, fat: 75 },
      Thu: { kcal: 2400, protein: 180, carbs: 230, fat: 75 },
      Fri: { kcal: 2400, protein: 180, carbs: 230, fat: 75 },
      Sat: { kcal: 2000, protein: 160, carbs: 180, fat: 65 },
      Sun: { kcal: 1800, protein: 160, carbs: 160, fat: 60 }
    }
  },
  maintain: {
    label: "Maintain",
    desc: "Even targets across the week",
    macros: Object.fromEntries(DAY_KEYS.map(d => [d, { kcal: 2700, protein: 180, carbs: 280, fat: 85 }]))
  },
  bulk: {
    label: "Bulk",
    desc: "Surplus on training days",
    macros: {
      Mon: { kcal: 3200, protein: 200, carbs: 350, fat: 90 },
      Tue: { kcal: 3200, protein: 200, carbs: 350, fat: 90 },
      Wed: { kcal: 3200, protein: 200, carbs: 350, fat: 90 },
      Thu: { kcal: 3000, protein: 190, carbs: 320, fat: 85 },
      Fri: { kcal: 3200, protein: 200, carbs: 350, fat: 90 },
      Sat: { kcal: 2800, protein: 180, carbs: 280, fat: 85 },
      Sun: { kcal: 2700, protein: 180, carbs: 270, fat: 85 }
    }
  }
};

const clone = (value) => JSON.parse(JSON.stringify(value));

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch (e) {
    return { ...fallback };
  }
}

function writeJsonStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

function base64EncodeUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64DecodeUtf8(value = "") {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function stateEnvelope(state, clientId) {
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    app: SYNC_APP_ID,
    updatedAt: new Date().toISOString(),
    updatedBy: clientId,
    state
  };
}

function syncClientId() {
  return "client-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultSyncConfig() {
  return {
    enabled: false,
    owner: "",
    repo: "",
    branch: "main",
    path: "state/reps-app-state.json",
    token: "",
    clientId: syncClientId()
  };
}

function defaultSyncMeta() {
  return {
    lastRemoteSha: null,
    lastSyncAt: null,
    dirty: false,
    conflict: false
  };
}

function loadSyncConfig() {
  const config = readJsonStorage(SYNC_CONFIG_KEY, defaultSyncConfig());
  return {
    ...defaultSyncConfig(),
    ...config,
    clientId: config.clientId || syncClientId()
  };
}

function loadSyncMeta() {
  return readJsonStorage(SYNC_META_KEY, defaultSyncMeta());
}

const AppContext = createContext(null);

function normalizeDeletedFoodEntries(value = {}) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.filter(Boolean).map(id => [String(id), true]));
  }
  return Object.fromEntries(
    Object.entries(value || {})
      .filter(([id]) => id != null && String(id).trim())
      .map(([id, deletedAt]) => [String(id), deletedAt || true])
  );
}

function normalizeDeletedRecipes(value = {}) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.filter(Boolean).map(id => [String(id), true]));
  }
  return Object.fromEntries(
    Object.entries(value || {})
      .filter(([id]) => id != null && String(id).trim())
      .map(([id, deletedAt]) => [String(id), deletedAt || true])
  );
}

function recipeIdentity(recipe = {}) {
  if (recipe.id !== undefined && recipe.id !== null && String(recipe.id).trim()) return String(recipe.id);
  return String(recipe.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function recipeWithDefaults(recipe = {}, index = 0) {
  const id = recipeIdentity(recipe) || `recipe-${index}`;
  const stamp = recipe.updatedAt || recipe.createdAt || "2026-06-05T00:00:00.000Z";
  return {
    id,
    name: String(recipe.name || "Untitled recipe").trim() || "Untitled recipe",
    category: recipe.category || "Recipes",
    tags: Array.isArray(recipe.tags) ? recipe.tags : [],
    servings: Number.isFinite(Number(recipe.servings)) && Number(recipe.servings) > 0 ? Number(recipe.servings) : 1,
    summary: recipe.summary || "",
    selections: recipe.selections || {},
    groups: Array.isArray(recipe.groups) ? recipe.groups : [],
    cooking: recipe.cooking || { equipment: "Electric hob", hobNote: DEFAULT_HOB_PREFERENCES.note, steps: [] },
    createdAt: recipe.createdAt || stamp,
    updatedAt: recipe.updatedAt || stamp
  };
}

function mergeSeedRecipeOption(seedOption = {}, currentOption = {}) {
  const merged = { ...seedOption, ...(currentOption || {}) };
  [
    "sourceUrl", "packAmount", "packUnit", "packPrice", "currency",
    "amount", "amountUnit", "displayAmount", "nutritionBasis",
    "kcalPer100", "proteinPer100", "carbsPer100", "fatPer100"
  ].forEach(key => {
    if (merged[key] === undefined || merged[key] === null || merged[key] === "") merged[key] = seedOption[key];
  });
  return merged;
}

function mergeSeedRecipeGroup(seedGroup = {}, currentGroup = {}) {
  const currentOptions = new Map((currentGroup.options || []).map(option => [String(option.id || ""), option]));
  const mergedOptions = (seedGroup.options || []).map(seedOption => {
    const currentOption = currentOptions.get(String(seedOption.id || ""));
    return currentOption ? mergeSeedRecipeOption(seedOption, currentOption) : structuredClone(seedOption);
  });
  (currentGroup.options || []).forEach(option => {
    if (!mergedOptions.some(merged => String(merged.id || "") === String(option.id || ""))) mergedOptions.push(option);
  });
  return {
    ...seedGroup,
    ...(currentGroup || {}),
    options: mergedOptions
  };
}

function mergeSeedRecipe(seed = {}, current = {}) {
  const currentRecipe = recipeWithDefaults(current);
  if (!currentRecipe.updatedAt || currentRecipe.updatedAt === "2026-06-05T00:00:00.000Z") {
    return structuredClone(seed);
  }
  const currentGroups = new Map((currentRecipe.groups || []).map(group => [String(group.id || ""), group]));
  const mergedGroups = (seed.groups || []).map(seedGroup => {
    const currentGroup = currentGroups.get(String(seedGroup.id || ""));
    return currentGroup ? mergeSeedRecipeGroup(seedGroup, currentGroup) : structuredClone(seedGroup);
  });
  (currentRecipe.groups || []).forEach(group => {
    if (!mergedGroups.some(merged => String(merged.id || "") === String(group.id || ""))) mergedGroups.push(group);
  });
  return recipeWithDefaults({
    ...seed,
    ...currentRecipe,
    groups: mergedGroups,
    selections: { ...(seed.selections || {}), ...(currentRecipe.selections || {}) },
    cooking: currentRecipe.cooking || seed.cooking,
    createdAt: currentRecipe.createdAt || seed.createdAt,
    updatedAt: currentRecipe.updatedAt || seed.updatedAt
  });
}

function cookingPreferencesWithDefaults(value = {}) {
  return {
    ...(value || {}),
    hob: {
      ...DEFAULT_HOB_PREFERENCES,
      ...((value || {}).hob || {}),
      scale: Array.isArray((value || {}).hob?.scale) && (value || {}).hob.scale.length
        ? (value || {}).hob.scale
        : DEFAULT_HOB_PREFERENCES.scale
    }
  };
}

function recipesWithStarter(recipes = [], deletedRecipes = {}) {
  const deleted = new Set(Object.keys(normalizeDeletedRecipes(deletedRecipes)));
  const map = new Map();
  const normalized = (Array.isArray(recipes) ? recipes : []).map(recipeWithDefaults);
  normalized.forEach((recipe, index) => {
    const id = recipeIdentity(recipe) || `recipe-${index}`;
    if (!deleted.has(id) && !map.has(id)) map.set(id, { ...recipe, id });
  });
  DEFAULT_RECIPE_SEEDS.forEach(seed => {
    const id = recipeIdentity(seed);
    if (!id || deleted.has(id)) return;
    map.set(id, map.has(id) ? mergeSeedRecipe(seed, map.get(id)) : structuredClone(seed));
  });
  return Array.from(map.values());
}

function foodEntryIdentity(date, item = {}) {
  if (item.id !== undefined && item.id !== null && String(item.id).trim()) return String(item.id);
  return [
    date || "",
    String(item.product || item.name || "food").trim().toLowerCase(),
    item.amount ?? "",
    item.kcal ?? "",
    item.protein ?? "",
    item.carbs ?? "",
    item.fat ?? ""
  ].join(":");
}

function removeDeletedFoodRows(foodByDate = {}, deletedFoodEntries = {}) {
  const deleted = new Set(Object.keys(normalizeDeletedFoodEntries(deletedFoodEntries)));
  if (deleted.size === 0) return foodByDate || {};
  const out = {};
  for (const [date, entries] of Object.entries(foodByDate || {})) {
    const kept = (entries || []).filter(item => !deleted.has(foodEntryIdentity(date, item)));
    if (kept.length) out[date] = kept;
  }
  return out;
}

function hydrateMissingFoodMacros(foodByDate = {}, catalogOverrides = {}) {
  const defaults = window.REPS_FOOD_MACRO_DEFAULTS || {};
  return Object.fromEntries(
    Object.entries(foodByDate || {}).map(([date, entries]) => [
      date,
      (entries || []).map(entry => {
        const key = foodCatalogKey(entry.product);
        const source = { ...(defaults[key] || {}), ...(catalogOverrides[key] || {}) };
        if (!source || (!Number.isFinite(Number(source.carbs)) && !Number.isFinite(Number(source.fat)))) return entry;
        const amount = Math.max(0, Number(entry.amount) || 1);
        const carbsMissing = entry.carbs == null || Number(entry.carbs) === 0;
        const fatMissing = entry.fat == null || Number(entry.fat) === 0;
        return {
          ...entry,
          carbs: carbsMissing && Number.isFinite(Number(source.carbs))
            ? Math.round(Number(source.carbs) * amount * 10) / 10
            : entry.carbs,
          fat: fatMissing && Number.isFinite(Number(source.fat))
            ? Math.round(Number(source.fat) * amount * 10) / 10
            : entry.fat
        };
      })
    ])
  );
}

function migrateProfile(p) {
  const defaultMacros = PRESETS.maintain.macros;
  const deletedFoodEntries = normalizeDeletedFoodEntries(p.deletedFoodEntries || p.deletedFoodEntryIds || {});
  const foodCatalogOverrides = p.foodCatalogOverrides || {};
  const foodByDate = hydrateMissingFoodMacros(
    removeDeletedFoodRows(p.foodByDate || {}, deletedFoodEntries),
    foodCatalogOverrides
  );
  const deletedRecipes = normalizeDeletedRecipes(p.deletedRecipes || p.deletedRecipeIds || {});
  const recipes = recipesWithStarter(p.recipes || [], deletedRecipes);
  const routines = p.routines && p.routines.length ? p.routines : [];
  const activeRoutineId = p.activeRoutineId && routines.some(r => r.id === p.activeRoutineId)
    ? p.activeRoutineId
    : (routines[0]?.id || null);
  return {
    id: p.id || "local",
    name: p.name || "Profile",
    birthday: p.birthday || "",
    unit: p.unit || "kg",
    hasHistory: p.hasHistory !== undefined ? !!p.hasHistory : false,
    macros: p.macros && p.macros.Mon ? p.macros : structuredClone(defaultMacros),
    preset: p.preset || "maintain",
    phase: p.phase || "maintain",
    targetWeight: p.targetWeight ?? null,
    progressionRules: progressionRulesWithDefaults(p.progressionRules),
    foodByDate,
    deletedFoodEntries,
    recipes,
    deletedRecipes,
    cookingPreferences: cookingPreferencesWithDefaults(p.cookingPreferences || {}),
    customExercises: p.customExercises || [],
    hiddenExercises: p.hiddenExercises || [],
    hiddenFoodItems: p.hiddenFoodItems || [],
    customFoodItems: p.customFoodItems || [],
    foodCatalogOverrides,
    foodCatalogOrder: p.foodCatalogOrder || [],
    weightEntries: p.weightEntries || [],
    blockNames: p.blockNames || {},
    blockStartOverrides: p.blockStartOverrides || {},
    blockGoals: p.blockGoals || {},
    hiddenBlockSheets: p.hiddenBlockSheets || [],
    customBlocks: p.customBlocks || [],
    deletedSessionIds: p.deletedSessionIds || [],
    sessionEdits: p.sessionEdits || {},
    loggedSessions: p.loggedSessions || [],
    bodyLedgerFoodsOpen: p.bodyLedgerFoodsOpen !== undefined ? !!p.bodyLedgerFoodsOpen : true,
    // Per-date Log adjustments (persisted overrides on the planned routine):
    //   sessionPlansByDate["2026-05-22"] = { extraExercises, removedKeys, setsByExercise, rpe, notes, status }
    sessionPlansByDate: p.sessionPlansByDate || {},
    // Manual entries that override the derived Daily Log values in Body:
    //   dailyOverrides["2026-05-22"] = { weight?: number|null, kcal?: number|null, protein?: number|null, note?: string }
    // A null field is an explicit blank/unlogged marker that prevents fallback to older sources.
    dailyOverrides: p.dailyOverrides || {},
    // Per-exercise per-date annotations rendered on the Strength chart:
    //   exerciseAnnotations["Incline DB Press"]["2026-05-22"] = { type: "pr"|"deload"|"injury"|"travel"|"sick"|"form_change"|"note", note: string }
    exerciseAnnotations: p.exerciseAnnotations || {},
    // Overrides for historical block durations (in-progress block editing)
    blockWeeksOverride: p.blockWeeksOverride || {},
    exerciseRenames: p.exerciseRenames || {},
    // Routine system
    routines,
    activeRoutineId,
    // Macro visibility
    trackCarbs: p.trackCarbs !== undefined ? p.trackCarbs : true,
    trackFat: p.trackFat !== undefined ? p.trackFat : true
  };
}

function migrateState(rawState = {}) {
  const parsed = rawState || {};
  const profiles = (parsed.profiles && parsed.profiles.length ? parsed.profiles : DEFAULT_STATE.profiles)
    .map(migrateProfile);
  const activeProfileId = profiles.some(p => p.id === parsed.activeProfileId)
    ? parsed.activeProfileId
    : profiles[0]?.id || DEFAULT_STATE.activeProfileId;
  return {
    ...DEFAULT_STATE,
    ...parsed,
    profiles,
    activeProfileId
  };
}

function unwrapRemoteState(payload) {
  if (payload?.app === SYNC_APP_ID && payload?.state) return payload.state;
  if (payload?.profiles) return payload;
  throw new Error("GitHub file does not look like Reps dashboard state.");
}

function githubApiHeaders(config) {
  return {
    Authorization: `Bearer ${String(config.token || "").trim()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function githubContentUrl(config) {
  const owner = encodeURIComponent(String(config.owner || "").trim());
  const repo = encodeURIComponent(String(config.repo || "").trim());
  const path = String(config.path || "").split("/").map(encodeURIComponent).join("/");
  const branch = encodeURIComponent(String(config.branch || "main").trim());
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
}

async function fetchGithubState(config) {
  const res = await fetch(githubContentUrl(config), { headers: githubApiHeaders(config) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub pull failed (${res.status}): ${text.slice(0, 180)}`);
  }
  const file = await res.json();
  const payload = JSON.parse(base64DecodeUtf8(file.content || ""));
  return {
    sha: file.sha,
    envelope: payload,
    state: migrateState(unwrapRemoteState(payload))
  };
}

async function putGithubState(config, state, sha = null) {
  const cleanPath = String(config.path || "state/reps-app-state.json").trim();
  const body = {
    message: `Sync Reps dashboard state ${new Date().toISOString()}`,
    content: base64EncodeUtf8(JSON.stringify(stateEnvelope(state, config.clientId), null, 2)),
    branch: config.branch || "main"
  };
  if (sha) body.sha = sha;
  const url = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...githubApiHeaders(config),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub push failed (${res.status}): ${text.slice(0, 180)}`);
  }
  const result = await res.json();
  return result.content?.sha || null;
}

function isGithubShaWriteError(message = "") {
  return /\(409\)|does not match|\(422\).*sha|\(422\).*missing_field/i.test(String(message || ""));
}

function blockNameFromSheet(sheet = "") {
  return String(sheet || "Workbook block")
    .replace(/[()]/g, "")
    .replace(/^Block\s+/i, "B")
    .trim() || "Workbook block";
}

function foodCatalogKey(product) {
  return String(product || "").trim().toLowerCase();
}

function finiteCatalogNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizedCatalogFoodItem(item = {}, index = 0) {
  const product = String(item.product || item.name || "").trim();
  if (!product) return null;
  const slug = product.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
  return {
    id: item.id || `migrated-food-${slug}-${index}`,
    product,
    kcalPerUnit: finiteCatalogNumber(item.kcalPerUnit ?? item.kcal),
    proteinPerUnit: finiteCatalogNumber(item.proteinPerUnit ?? item.protein),
    carbs: finiteCatalogNumber(item.carbs),
    fat: finiteCatalogNumber(item.fat),
    category: item.category || "Migrated",
    macroSource: item.macroSource || "",
    sourceLabel: item.sourceLabel || "",
    sourceUrl: item.sourceUrl || ""
  };
}

function materializeEffectiveState(rawState, activeProfileId) {
  const next = migrateState(clone(rawState));
  const idx = next.profiles.findIndex(p => p.id === activeProfileId);
  if (idx < 0 || !window.RepsData) return next;
  const profile = next.profiles[idx];
  const routineDays = clone(
    (profile.routines || []).find(r => r.id === profile.activeRoutineId)?.days ||
    profile.routines?.[0]?.days ||
    window.__DEFAULT_PLANNED_ROUTINE ||
    window.PLANNED_ROUTINE ||
    []
  );
  const routines = (profile.routines || []).length
    ? profile.routines
    : routineDays.length
      ? [{ id: "routine-migrated-default", name: "Push Pull Legs + Boxing", days: routineDays }]
      : [];
  const activeRoutineId = profile.activeRoutineId || routines[0]?.id || null;
  const sessions = (window.RepsData.allSessions?.() || []).map(s => ({
    ...clone(s),
    source: "github-migrated"
  }));
  const weightEntries = (window.RepsData.mergedWeightData?.(profile, null) || []).map(row => ({
    date: row.date,
    weight: row.value,
    note: row.note || ""
  }));
  const dailyOverrides = clone(profile.dailyOverrides || {});
  const foodByDate = profile.foodByDate || {};
  const addMacroOverride = (row, field) => {
    if (!row?.date || row.value == null) return;
    const hasFoodTotal = (foodByDate[row.date] || []).length > 0;
    const existing = dailyOverrides[row.date] || {};
    if (hasFoodTotal || Object.prototype.hasOwnProperty.call(existing, field)) return;
    dailyOverrides[row.date] = { ...existing, [field]: row.value };
  };
  (window.RepsData.mergedNutritionData?.(profile, "kcal", null, false) || []).forEach(row => addMacroOverride(row, "kcal"));
  (window.RepsData.mergedNutritionData?.(profile, "protein", null, false) || []).forEach(row => addMacroOverride(row, "protein"));

  const customFoodItems = clone(profile.customFoodItems || []);
  const foodKeys = new Set(customFoodItems.map(item => foodCatalogKey(item.product)));
  (window.RepsData.foodItems || []).forEach((item, index) => {
    const normalized = normalizedCatalogFoodItem(item, index);
    const key = foodCatalogKey(normalized?.product);
    if (!normalized || !key || foodKeys.has(key)) return;
    customFoodItems.push(normalized);
    foodKeys.add(key);
  });

  const existingBlockIds = new Set((profile.customBlocks || []).map(b => b.id));
  const migratedBlocks = (window.RepsData.blockSummary?.(profile) || []).map(block => {
    const sheet = block.sheet || block.name || "workbook-block";
    const id = `migrated-${String(sheet).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const startDate = profile.blockStartOverrides?.[sheet] || block.weeks?.[0]?.weekStart || window.RepsData.TODAY;
    return {
      id,
      name: profile.blockNames?.[sheet] || blockNameFromSheet(sheet),
      startDate,
      weeks: profile.blockWeeksOverride?.[sheet] || block.weeks?.length || 1,
      goal: profile.blockGoals?.[sheet] || "Migrated from workbook history"
    };
  }).filter(block => block.startDate && !existingBlockIds.has(block.id));

  next.profiles[idx] = {
    ...profile,
    hasHistory: false,
    routines,
    activeRoutineId,
    loggedSessions: sessions,
    deletedSessionIds: [],
    sessionEdits: {},
    weightEntries,
    dailyOverrides,
    customFoodItems,
    customBlocks: [...(profile.customBlocks || []), ...migratedBlocks],
    hiddenBlockSheets: [],
    blockNames: {},
    blockStartOverrides: {},
    blockWeeksOverride: {}
  };
  return next;
}

function normalizeSessionDay(value) {
  if (window.RepsData?.normalizeDayKey) return window.RepsData.normalizeDayKey(value);
  const key = String(value || "").trim().toLowerCase().slice(0, 3);
  return { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" }[key] || null;
}

function sessionSlotPlannedDate(session = {}) {
  if (window.RepsData?.plannedDateForSession) return window.RepsData.plannedDateForSession(session);
  return session.plannedDate || session.date || null;
}

function sameLoggedSessionSlot(a = {}, b = {}) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  const aPlanned = sessionSlotPlannedDate(a);
  const bPlanned = sessionSlotPlannedDate(b);
  const aDay = normalizeSessionDay(a.routineDay || a.nominalDay || a.day);
  const bDay = normalizeSessionDay(b.routineDay || b.nominalDay || b.day);
  if (aPlanned && bPlanned && aPlanned === bPlanned && (!aDay || !bDay || aDay === bDay)) return true;
  if (a.date && b.date && a.date === b.date && (!aDay || !bDay || aDay === bDay)) return true;
  return false;
}

function stateLoggedSetCount(sets = []) {
  return (sets || []).filter(set =>
    set.weight != null ||
    set.repsNumber != null ||
    set.reps != null ||
    set.durationMinutes ||
    set.duration ||
    set.rpe ||
    set.note
  ).length;
}

function stateSessionSetCount(session = {}) {
  const explicit = Number(session.performedSetCount);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return (session.entries || []).reduce((sum, entry) => sum + stateLoggedSetCount(entry.sets || []), 0);
}

function stateSessionScore(session = {}) {
  return (stateSessionSetCount(session) * 1000) +
    (((session.entries || []).length) * 10) +
    (session.status === "performed" ? 1 : 0);
}

function betterLoggedSession(current, candidate) {
  if (!current) return candidate;
  if (!candidate) return current;
  const currentScore = stateSessionScore(current);
  const candidateScore = stateSessionScore(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;
  const currentTime = Date.parse(current.updatedAt || current.savedAt || current.createdAt || "") || 0;
  const candidateTime = Date.parse(candidate.updatedAt || candidate.savedAt || candidate.createdAt || "") || 0;
  return candidateTime > currentTime ? candidate : current;
}

function routineDaysForProfile(profile = {}) {
  const routines = profile.routines || [];
  const active = routines.find(r => r.id === profile.activeRoutineId) || routines[0];
  return active?.days || [];
}

function plannedExercisesForDay(profile = {}, routineDay = "") {
  const day = normalizeSessionDay(routineDay);
  return (routineDaysForProfile(profile).find(d => d.day === day)?.exercises || []);
}

function planSetCount(plan = {}) {
  return Object.values(plan.setsByExercise || {}).reduce((sum, sets) =>
    sum + (Array.isArray(sets) ? sets.filter(set =>
      set._edited ||
      set._done === true ||
      set._done === false ||
      String(set.weight ?? "").trim() !== "" ||
      String(set.reps ?? "").trim() !== "" ||
      String(set.duration ?? "").trim() !== "" ||
      String(set.rpe ?? "").trim() !== "" ||
      String(set.note ?? "").trim() !== ""
    ).length : 0), 0);
}

function planVisibleExerciseCount(plan = {}, profile = {}, date = "") {
  const routineDay = normalizeSessionDay(plan.routineDay) || (date ? window.RepsData?.dayName?.(date) : null) || "";
  const removed = new Set(plan.removedKeys || []);
  const planned = plannedExercisesForDay(profile, routineDay)
    .map((ex, i) => ({ ...ex, _key: `p-${routineDay}-${i}` }))
    .filter(ex => !removed.has(ex._key));
  const extra = (plan.extraExercises || [])
    .map((ex, i) => ({ ...ex, _key: ex._key || `e-${i}` }))
    .filter(ex => !removed.has(ex._key));
  return planned.length + extra.length;
}

function bestLoggedSessionForPlan(profile = {}, date = "", plan = {}) {
  const plannedDate = plan.plannedDate || date;
  const routineDay = normalizeSessionDay(plan.routineDay);
  return (profile.loggedSessions || []).reduce((best, session) => {
    const sameDate = sessionSlotPlannedDate(session) === plannedDate || session.date === date;
    const sessionDay = normalizeSessionDay(session.routineDay || session.nominalDay || session.day);
    const sameDay = !routineDay || !sessionDay || routineDay === sessionDay;
    if (!sameDate || !sameDay || session.status === "skipped" || stateSessionSetCount(session) <= 0) return best;
    return betterLoggedSession(best, session);
  }, null);
}

function sanitizeProfileForPush(profile = {}) {
  const nextPlans = {};
  for (const [date, plan] of Object.entries(profile.sessionPlansByDate || {})) {
    const logged = bestLoggedSessionForPlan(profile, date, plan);
    if (logged) {
      const visibleExercises = planVisibleExerciseCount(plan, profile, date);
      const loggedExercises = (logged.entries || []).length;
      const sets = planSetCount(plan);
      const loggedSets = stateSessionSetCount(logged);
      if (visibleExercises < loggedExercises || sets < loggedSets) continue;
    }
    nextPlans[date] = plan;
  }
  const deletedFoodEntries = normalizeDeletedFoodEntries(profile.deletedFoodEntries || {});
  const deletedRecipes = normalizeDeletedRecipes(profile.deletedRecipes || {});
  const recipes = recipesWithStarter(profile.recipes || [], deletedRecipes)
    .filter(recipe => !deletedRecipes[recipeIdentity(recipe)]);
  return {
    ...profile,
    foodByDate: removeDeletedFoodRows(profile.foodByDate || {}, deletedFoodEntries),
    deletedFoodEntries,
    recipes,
    deletedRecipes,
    cookingPreferences: cookingPreferencesWithDefaults(profile.cookingPreferences || {}),
    sessionPlansByDate: nextPlans
  };
}

function sanitizeStateForPush(rawState = {}) {
  const next = migrateState(clone(rawState));
  return {
    ...next,
    profiles: (next.profiles || []).map(sanitizeProfileForPush)
  };
}

function mergeByKey(remoteItems = [], localItems = [], keyFn, choose = (_remote, local) => local) {
  const map = new Map();
  (remoteItems || []).forEach((item, index) => {
    const key = keyFn(item, index);
    if (key) map.set(key, item);
  });
  (localItems || []).forEach((item, index) => {
    const key = keyFn(item, index);
    if (!key) return;
    map.set(key, map.has(key) ? choose(map.get(key), item) : item);
  });
  return Array.from(map.values());
}

function mergeDeletedFoodEntries(remote = {}, local = {}) {
  return {
    ...normalizeDeletedFoodEntries(remote),
    ...normalizeDeletedFoodEntries(local)
  };
}

function mergeDeletedRecipes(remote = {}, local = {}) {
  return {
    ...normalizeDeletedRecipes(remote),
    ...normalizeDeletedRecipes(local)
  };
}

function newerByUpdatedAt(remoteItem = {}, localItem = {}) {
  const remoteTime = Date.parse(remoteItem.updatedAt || remoteItem.createdAt || "") || 0;
  const localTime = Date.parse(localItem.updatedAt || localItem.createdAt || "") || 0;
  return localTime >= remoteTime ? localItem : remoteItem;
}

function mergeRecipes(remote = [], local = [], deletedRecipes = {}) {
  const deleted = new Set(Object.keys(normalizeDeletedRecipes(deletedRecipes)));
  return mergeByKey(
    recipesWithStarter(remote || [], deletedRecipes),
    recipesWithStarter(local || [], deletedRecipes),
    recipe => recipeIdentity(recipe),
    newerByUpdatedAt
  ).filter(recipe => !deleted.has(recipeIdentity(recipe)));
}

function mergeFoodByDate(remote = {}, local = {}, deletedFoodEntries = {}) {
  const dates = new Set([...Object.keys(remote || {}), ...Object.keys(local || {})]);
  const deleted = new Set(Object.keys(normalizeDeletedFoodEntries(deletedFoodEntries)));
  const out = {};
  dates.forEach(date => {
    const entries = mergeByKey(remote[date] || [], local[date] || [], item => foodEntryIdentity(date, item))
      .filter(item => !deleted.has(foodEntryIdentity(date, item)));
    if (entries.length) out[date] = entries;
  });
  return out;
}

function mergeLoggedSessions(remote = [], local = []) {
  return [...(remote || []), ...(local || [])].reduce((list, session) => {
    const index = list.findIndex(existing => sameLoggedSessionSlot(existing, session));
    if (index < 0) return [session, ...list];
    const next = [...list];
    next[index] = betterLoggedSession(next[index], session);
    return next;
  }, []);
}

function mergeProfiles(remoteProfile = {}, localProfile = {}) {
  const merged = { ...remoteProfile, ...localProfile };
  merged.deletedFoodEntries = mergeDeletedFoodEntries(remoteProfile.deletedFoodEntries || {}, localProfile.deletedFoodEntries || {});
  merged.foodByDate = mergeFoodByDate(remoteProfile.foodByDate || {}, localProfile.foodByDate || {}, merged.deletedFoodEntries);
  merged.deletedRecipes = mergeDeletedRecipes(remoteProfile.deletedRecipes || {}, localProfile.deletedRecipes || {});
  merged.recipes = mergeRecipes(remoteProfile.recipes || [], localProfile.recipes || [], merged.deletedRecipes);
  merged.cookingPreferences = cookingPreferencesWithDefaults({
    ...(remoteProfile.cookingPreferences || {}),
    ...(localProfile.cookingPreferences || {})
  });
  merged.dailyOverrides = { ...(remoteProfile.dailyOverrides || {}), ...(localProfile.dailyOverrides || {}) };
  merged.sessionPlansByDate = { ...(remoteProfile.sessionPlansByDate || {}), ...(localProfile.sessionPlansByDate || {}) };
  merged.loggedSessions = mergeLoggedSessions(remoteProfile.loggedSessions || [], localProfile.loggedSessions || []);
  merged.weightEntries = mergeByKey(remoteProfile.weightEntries || [], localProfile.weightEntries || [], item =>
    String(item.id ?? `${item.date}:${item.weight}:${item.note || ""}`)
  );
  merged.customFoodItems = mergeByKey(remoteProfile.customFoodItems || [], localProfile.customFoodItems || [], item =>
    String(item.id || foodCatalogKey(item.product || item.name))
  );
  merged.foodCatalogOverrides = {
    ...(remoteProfile.foodCatalogOverrides || {}),
    ...(localProfile.foodCatalogOverrides || {})
  };
  merged.foodCatalogOrder = (localProfile.foodCatalogOrder || []).length
    ? localProfile.foodCatalogOrder
    : (remoteProfile.foodCatalogOrder || []);
  merged.customExercises = mergeByKey(remoteProfile.customExercises || [], localProfile.customExercises || [], item =>
    String(item.id || item.name)
  );
  merged.hiddenExercises = [...new Set([...(remoteProfile.hiddenExercises || []), ...(localProfile.hiddenExercises || [])])];
  merged.hiddenFoodItems = [...new Set([...(remoteProfile.hiddenFoodItems || []), ...(localProfile.hiddenFoodItems || [])])];
  return sanitizeProfileForPush(merged);
}

function mergeRemoteAndLocalState(remoteState = {}, localState = {}) {
  const remote = migrateState(clone(remoteState));
  const local = sanitizeStateForPush(localState);
  const remoteProfiles = new Map((remote.profiles || []).map(profile => [profile.id, profile]));
  const localProfiles = new Map((local.profiles || []).map(profile => [profile.id, profile]));
  const profileIds = [...new Set([...remoteProfiles.keys(), ...localProfiles.keys()])];
  return migrateState({
    ...remote,
    ...local,
    profiles: profileIds.map(id => {
      const r = remoteProfiles.get(id);
      const l = localProfiles.get(id);
      return r && l ? mergeProfiles(r, l) : sanitizeProfileForPush(l || r);
    })
  });
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      return migrateState(JSON.parse(raw));
    }
  } catch (e) { console.warn("State load failed", e); }
  return migrateState(DEFAULT_STATE);
}

function AppStateProvider({ children }) {
  const [state, setStateRaw] = useState(load);
  const [syncConfig, setSyncConfigState] = useState(loadSyncConfig);
  const [syncMeta, setSyncMetaState] = useState(loadSyncMeta);
  const [syncStatus, setSyncStatus] = useState({ state: "idle", message: "Sync idle" });
  const [syncConflict, setSyncConflict] = useState(null);
  const didMountRef = useRef(false);
  const remoteApplyRef = useRef(false);
  const pushTimerRef = useRef(null);
  const stateRef = useRef(state);
  const syncMetaRef = useRef(syncMeta);
  const pushInFlightRef = useRef(null);

  const setState = (updater) => {
    const base = stateRef.current || state;
    const nextRaw = typeof updater === "function" ? updater(base) : updater;
    const next = migrateState(nextRaw);
    stateRef.current = next;
    setStateRaw(next);
    return next;
  };

  const updateSyncMeta = (updater) => {
    setSyncMetaState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      syncMetaRef.current = next;
      writeJsonStorage(SYNC_META_KEY, next);
      return next;
    });
  };

  useEffect(() => {
    stateRef.current = state;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (remoteApplyRef.current) {
      remoteApplyRef.current = false;
      return;
    }
    updateSyncMeta(prev => ({ ...prev, dirty: true, conflict: false }));
    if (syncConfig.enabled && syncConfig.token) {
      setSyncStatus({ state: "idle", message: "Local changes saved. Push when done." });
    }
  }, [state]);

  useEffect(() => {
    writeJsonStorage(SYNC_CONFIG_KEY, syncConfig);
  }, [syncConfig]);

  useEffect(() => {
    syncMetaRef.current = syncMeta;
    writeJsonStorage(SYNC_META_KEY, syncMeta);
  }, [syncMeta]);

  const activeProfile = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0];

  const updateSyncConfig = (patch) => {
    setSyncConfigState(prev => ({
      ...prev,
      ...patch,
      clientId: patch.clientId || prev.clientId || syncClientId()
    }));
  };

  const disableSync = () => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    setSyncConfigState(prev => ({ ...prev, enabled: false, token: "" }));
    updateSyncMeta(defaultSyncMeta());
    setSyncConflict(null);
    setSyncStatus({ state: "idle", message: "GitHub sync disabled" });
  };

  const replaceState = (nextRaw, options = {}) => {
    const next = migrateState(nextRaw);
    if (options.remoteClean) remoteApplyRef.current = true;
    setState(next);
    if (options.remoteClean) {
      updateSyncMeta(prev => ({ ...prev, dirty: false, conflict: false }));
      setSyncConflict(null);
    }
    return next;
  };

  const exportEffectiveState = () => materializeEffectiveState(state, activeProfile.id);

  const setRemoteCleanState = (nextState, sha, message = "Pulled GitHub state") => {
    remoteApplyRef.current = true;
    stateRef.current = nextState;
    setState(nextState);
    updateSyncMeta(prev => ({
      ...prev,
      lastRemoteSha: sha,
      lastSyncAt: new Date().toISOString(),
      dirty: false,
      conflict: false
    }));
    setSyncConflict(null);
    setSyncStatus({ state: "ok", message });
  };

  const setRemoteMergedDirtyState = (nextState, sha, message = "Pulled GitHub state and kept local edits") => {
    remoteApplyRef.current = true;
    stateRef.current = nextState;
    setState(nextState);
    updateSyncMeta(prev => ({
      ...prev,
      lastRemoteSha: sha,
      lastSyncAt: new Date().toISOString(),
      dirty: true,
      conflict: false
    }));
    setSyncConflict(null);
    setSyncStatus({ state: "ok", message });
  };

  const pullRemoteState = async (options = {}) => {
    const config = options.config || syncConfig;
    if (!config.token) {
      setSyncStatus({ state: "error", message: "Add a GitHub token before pulling." });
      return null;
    }
    try {
      setSyncStatus({ state: "syncing", message: "Pulling GitHub state..." });
      const remote = await fetchGithubState(config);
      if (!remote) {
        setSyncStatus({ state: "ok", message: "No remote state file yet. Push once to create it." });
        return null;
      }
      const remoteState = sanitizeStateForPush(remote.state);
      if (syncMetaRef.current?.dirty && !options.preferRemote) {
        const mergedState = mergeRemoteAndLocalState(remoteState, stateRef.current);
        setRemoteMergedDirtyState(mergedState, remote.sha, "Pull complete. Local changes kept; push to update GitHub.");
      } else {
        setRemoteCleanState(remoteState, remote.sha, "Pull complete. GitHub applied.");
      }
      return remote;
    } catch (e) {
      setSyncStatus({ state: "error", message: e.message || "GitHub pull failed." });
      return null;
    }
  };

  const pushRemoteState = async (options = {}) => {
    if (!options.silent && pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
    if (pushInFlightRef.current) {
      await pushInFlightRef.current.catch(() => null);
    }
    const config = options.config || syncConfig;
    if (!config.token) {
      if (!options.silent) setSyncStatus({ state: "error", message: "Add a GitHub token before pushing." });
      return null;
    }
    const runPush = async () => {
      if (!options.silent) setSyncStatus({ state: "syncing", message: "Checking GitHub state..." });
      const remote = await fetchGithubState(config);
      let remoteSha = remote?.sha || null;
      let pushState = remote?.state
        ? mergeRemoteAndLocalState(remote.state, stateRef.current)
        : sanitizeStateForPush(stateRef.current);
      if (!options.silent) setSyncStatus({ state: "syncing", message: remote?.state ? "Merging local changes with GitHub..." : "Pushing GitHub state..." });
      let nextSha;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          nextSha = await putGithubState(config, pushState, remoteSha);
          break;
        } catch (e) {
          const isShaConflict = isGithubShaWriteError(e.message);
          if (!isShaConflict || attempt === 2) throw e;
          const latestRemote = await fetchGithubState(config);
          remoteSha = latestRemote?.sha || null;
          pushState = latestRemote?.state
            ? mergeRemoteAndLocalState(latestRemote.state, pushState)
            : sanitizeStateForPush(pushState);
        }
      }
      if (!nextSha) {
        throw new Error("GitHub push failed: no updated file SHA returned.");
      }
      remoteApplyRef.current = true;
      stateRef.current = pushState;
      setState(pushState);
      updateSyncMeta(prev => ({
        ...prev,
        lastRemoteSha: nextSha,
        lastSyncAt: new Date().toISOString(),
        dirty: false,
        conflict: false
      }));
      setSyncConflict(null);
      setSyncStatus({ state: "ok", message: "Push complete. Local changes merged with GitHub." });
      return nextSha;
    };

    const promise = runPush();
    pushInFlightRef.current = promise;
    try {
      return await promise;
    } catch (e) {
      setSyncStatus({ state: "error", message: e.message || "GitHub push failed." });
      return null;
    } finally {
      if (pushInFlightRef.current === promise) pushInFlightRef.current = null;
    }
  };

  const resolveSyncConflict = async (choice) => {
    if (!syncConflict) return;
    if (choice === "remote") await pullRemoteState({ preferRemote: true });
    if (choice === "local") await pushRemoteState();
  };
  const updateProfile = (id, patch) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === id ? { ...p, ...patch } : p)
    }));
  };

  const updateMacros = (id, day, patch) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === id
        ? { ...p, macros: { ...p.macros, [day]: { ...p.macros[day], ...patch } } }
        : p)
    }));
  };

  const setMacroPreset = (id, preset) => {
    const p = PRESETS[preset];
    if (!p) return;
    setState(s => ({
      ...s,
      profiles: s.profiles.map(prof => prof.id === id
        ? { ...prof, macros: structuredClone(p.macros), preset }
        : prof)
    }));
  };

  const addProfile = (name) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 24) + "-" + Date.now().toString(36).slice(-4);
    const freshProfile = migrateProfile({
      id,
      name,
      birthday: "",
      unit: "kg",
      hasHistory: false,
      macros: structuredClone(PRESETS.maintain.macros),
      preset: "maintain",
      phase: "maintain",
      foodByDate: {},
      customExercises: [],
      hiddenExercises: [],
      exerciseRenames: {}
    });
    setState(s => ({
      ...s,
      profiles: [...s.profiles, freshProfile],
      activeProfileId: id
    }));
  };

  const setActiveProfile = (id) => setState(s => ({ ...s, activeProfileId: id }));

  const deleteProfile = (id) => {
    setState(s => {
      if (s.profiles.length <= 1) return s;
      const remaining = s.profiles.filter(p => p.id !== id);
      return {
        ...s,
        profiles: remaining,
        activeProfileId: s.activeProfileId === id ? remaining[0].id : s.activeProfileId
      };
    });
  };

  const addFoodEntry = (date, entry) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const id = entry.id || `food-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return {
          ...p,
          foodByDate: {
            ...(p.foodByDate || {}),
            [date]: [{ ...entry, id, createdAt: entry.createdAt || new Date().toISOString() }, ...((p.foodByDate || {})[date] || [])]
          }
        };
      })
    }));
  };

  const removeFoodEntry = (date, id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const foodByDate = { ...(p.foodByDate || {}) };
        const existing = foodByDate[date] || [];
        const removed = existing.find(f => foodEntryIdentity(date, f) === String(id));
        const deleteKey = removed ? foodEntryIdentity(date, removed) : String(id || "");
        if (!deleteKey) return p;
        const entries = existing.filter(f => foodEntryIdentity(date, f) !== deleteKey);
        if (entries.length) foodByDate[date] = entries;
        else delete foodByDate[date];
        return {
          ...p,
          foodByDate,
          deletedFoodEntries: {
            ...normalizeDeletedFoodEntries(p.deletedFoodEntries || {}),
            [deleteKey]: new Date().toISOString()
          }
        };
      })
    }));
  };

  const addCustomExercise = (ex) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        customExercises: [{ ...ex, id: "custom-" + Date.now() }, ...(p.customExercises || [])]
      } : p)
    }));
  };

  const hideExercise = (name) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        hiddenExercises: [...new Set([...(p.hiddenExercises || []), name])]
      } : p)
    }));
  };

  const unhideExercise = (name) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        hiddenExercises: (p.hiddenExercises || []).filter(n => n !== name)
      } : p)
    }));
  };

  const deleteSession = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        deletedSessionIds: [...new Set([...(p.deletedSessionIds || []), id])]
      } : p)
    }));
  };

  const restoreSession = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        deletedSessionIds: (p.deletedSessionIds || []).filter(x => x !== id)
      } : p)
    }));
  };

  const editSession = (id, patch) => {
    const { _clearSessionPlanDates, ...sessionPatch } = patch || {};
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const raw = (p.loggedSessions || []).find(x => x.id === id);
        const previousEffectiveDate = (p.sessionEdits || {})[id]?.date || raw?.date;
        const nextEffectiveDate = sessionPatch.date || previousEffectiveDate;
        const previousPlannedDate = (p.sessionEdits || {})[id]?.plannedDate || raw?.plannedDate;
        const nextPlannedDate = sessionPatch.plannedDate || previousPlannedDate;
        const datesToClear = new Set([
          raw?.date,
          previousEffectiveDate,
          nextEffectiveDate,
          previousPlannedDate,
          nextPlannedDate,
          ...(_clearSessionPlanDates || [])
        ].filter(Boolean));
        const nextPlans = Object.fromEntries(
          Object.entries(p.sessionPlansByDate || {}).filter(([date]) => !datesToClear.has(date))
        );
        return {
          ...p,
          sessionEdits: {
            ...(p.sessionEdits || {}),
            [id]: { ...((p.sessionEdits || {})[id] || {}), ...sessionPatch }
          },
          sessionPlansByDate: nextPlans
        };
      })
    }));
  };

  const clearSessionEdit = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        sessionEdits: Object.fromEntries(Object.entries(p.sessionEdits || {}).filter(([k]) => k !== id))
      } : p)
    }));
  };

  // Per-date Log adjustments (persisted overrides on the planned routine)
  const updateSessionPlan = (date, patch) => {
    const stampedPatch = { ...(patch || {}), updatedAt: patch?.updatedAt || new Date().toISOString() };
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        sessionPlansByDate: {
          ...(p.sessionPlansByDate || {}),
          [date]: { ...((p.sessionPlansByDate || {})[date] || {}), ...stampedPatch }
        }
      } : p)
    }));
  };

  // Manual daily-log overrides (weight / kcal / protein for any date)
  const updateDailyOverride = (date, patch) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        dailyOverrides: {
          ...(p.dailyOverrides || {}),
          [date]: { ...((p.dailyOverrides || {})[date] || {}), ...patch }
        }
      } : p)
    }));
  };

  const clearDailyOverride = (date, field) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const current = (p.dailyOverrides || {})[date] || {};
        if (!field) {
          // Drop the entire day
          return {
            ...p,
            dailyOverrides: Object.fromEntries(
              Object.entries(p.dailyOverrides || {}).filter(([k]) => k !== date)
            )
          };
        }
        const nextMap = { ...(p.dailyOverrides || {}) };
        nextMap[date] = { ...current, [field]: null };
        return { ...p, dailyOverrides: nextMap };
      })
    }));
  };

  // Per-exercise per-date annotations
  const setExerciseAnnotation = (exerciseName, date, patch) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const all = p.exerciseAnnotations || {};
        const forEx = { ...(all[exerciseName] || {}) };
        forEx[date] = { ...(forEx[date] || {}), ...patch };
        return { ...p, exerciseAnnotations: { ...all, [exerciseName]: forEx } };
      })
    }));
  };

  const clearExerciseAnnotation = (exerciseName, date) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const all = p.exerciseAnnotations || {};
        if (!all[exerciseName] || !all[exerciseName][date]) return p;
        const forEx = { ...all[exerciseName] };
        delete forEx[date];
        const nextAll = { ...all };
        if (Object.keys(forEx).length === 0) delete nextAll[exerciseName];
        else nextAll[exerciseName] = forEx;
        return { ...p, exerciseAnnotations: nextAll };
      })
    }));
  };

  const clearSessionPlan = (date) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        sessionPlansByDate: Object.fromEntries(
          Object.entries(p.sessionPlansByDate || {}).filter(([k]) => k !== date)
        )
      } : p)
    }));
  };

  const addLoggedSession = (session) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        loggedSessions: [session, ...(p.loggedSessions || [])]
      } : p)
    }));
  };

  const removeLoggedSession = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        loggedSessions: (p.loggedSessions || []).filter(x => x.id !== id)
      } : p)
    }));
  };

  const upsertLoggedSession = (session, options = {}) => {
    const stampedSession = {
      ...session,
      updatedAt: session.updatedAt || new Date().toISOString()
    };
    const clearDates = new Set([
      stampedSession.date,
      stampedSession.plannedDate,
      ...(options.clearPlanDates || [])
    ].filter(Boolean));
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const removedIds = new Set();
        const keptSessions = (p.loggedSessions || []).filter(existing => {
          const remove = sameLoggedSessionSlot(existing, stampedSession);
          if (remove && existing.id) removedIds.add(existing.id);
          return !remove;
        });
        const nextEdits = Object.fromEntries(
          Object.entries(p.sessionEdits || {}).filter(([id]) => !removedIds.has(id) && id !== stampedSession.id)
        );
        const nextPlans = Object.fromEntries(
          Object.entries(p.sessionPlansByDate || {}).filter(([date]) => !clearDates.has(date))
        );
        return {
          ...p,
          loggedSessions: [stampedSession, ...keptSessions],
          sessionEdits: nextEdits,
          sessionPlansByDate: nextPlans
        };
      })
    }));
  };

  const addCustomFoodItem = (item) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        customFoodItems: [{ ...item, id: "food-" + Date.now() }, ...(p.customFoodItems || [])]
      } : p)
    }));
  };

  const removeCustomFoodItem = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        customFoodItems: (p.customFoodItems || []).filter(f => f.id !== id)
      } : p)
    }));
  };

  const addRecipe = (recipe) => {
    const now = new Date().toISOString();
    const id = recipe.id || `recipe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const nextRecipe = recipeWithDefaults({ ...recipe, id, createdAt: recipe.createdAt || now, updatedAt: now });
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        recipes: [nextRecipe, ...(p.recipes || []).filter(r => recipeIdentity(r) !== id)],
        deletedRecipes: Object.fromEntries(
          Object.entries(normalizeDeletedRecipes(p.deletedRecipes || {})).filter(([recipeId]) => recipeId !== id)
        )
      } : p)
    }));
    return id;
  };

  const updateRecipe = (id, patch) => {
    const recipeId = String(id || "").trim();
    if (!recipeId) return;
    const now = new Date().toISOString();
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const existing = (p.recipes || []).find(r => recipeIdentity(r) === recipeId);
        const nextRecipe = recipeWithDefaults({ ...(existing || { id: recipeId }), ...(patch || {}), id: recipeId, updatedAt: now });
        const recipes = (p.recipes || []).some(r => recipeIdentity(r) === recipeId)
          ? (p.recipes || []).map(r => recipeIdentity(r) === recipeId ? nextRecipe : r)
          : [nextRecipe, ...(p.recipes || [])];
        return { ...p, recipes };
      })
    }));
  };

  const deleteRecipe = (id) => {
    const recipeId = String(id || "").trim();
    if (!recipeId) return;
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        recipes: (p.recipes || []).filter(r => recipeIdentity(r) !== recipeId),
        deletedRecipes: {
          ...normalizeDeletedRecipes(p.deletedRecipes || {}),
          [recipeId]: new Date().toISOString()
        }
      } : p)
    }));
  };

  const importRecipes = (incoming = []) => {
    const list = Array.isArray(incoming) ? incoming : [incoming];
    const now = new Date().toISOString();
    const normalized = list
      .filter(Boolean)
      .map((recipe, index) => recipeWithDefaults({
        ...recipe,
        id: recipe.id || recipeIdentity(recipe) || `recipe-import-${Date.now().toString(36)}-${index}`,
        createdAt: recipe.createdAt || now,
        updatedAt: now
      }));
    if (!normalized.length) return 0;
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const byId = new Map((p.recipes || []).map(recipe => [recipeIdentity(recipe), recipe]));
        normalized.forEach(recipe => byId.set(recipeIdentity(recipe), recipe));
        const importedIds = new Set(normalized.map(recipeIdentity));
        return {
          ...p,
          recipes: Array.from(byId.values()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))),
          deletedRecipes: Object.fromEntries(
            Object.entries(normalizeDeletedRecipes(p.deletedRecipes || {})).filter(([id]) => !importedIds.has(id))
          )
        };
      })
    }));
    return normalized.length;
  };

  // Routines
  const addRoutine = (routine) => {
    const id = "routine-" + Date.now().toString(36);
    const newRoutine = { ...routine, id };
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        routines: [...(p.routines || []), newRoutine],
        activeRoutineId: p.activeRoutineId || id
      } : p)
    }));
    return id;
  };

  const updateRoutine = (id, patch) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        routines: (p.routines || []).map(r => r.id === id ? { ...r, ...patch } : r)
      } : p)
    }));
  };

  const deleteRoutine = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        routines: (p.routines || []).filter(r => r.id !== id),
        activeRoutineId: p.activeRoutineId === id
          ? ((p.routines || []).filter(r => r.id !== id)[0]?.id || null)
          : p.activeRoutineId
      } : p)
    }));
  };

  const setActiveRoutine = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? { ...p, activeRoutineId: id } : p)
    }));
  };

  // Custom training blocks
  const addCustomBlock = (block) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        customBlocks: [...(p.customBlocks || []), { ...block, id: "block-" + Date.now().toString(36) }]
      } : p)
    }));
  };

  const updateCustomBlock = (id, patch) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        customBlocks: (p.customBlocks || []).map(b => b.id === id ? { ...b, ...patch } : b)
      } : p)
    }));
  };

  const deleteCustomBlock = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        customBlocks: (p.customBlocks || []).filter(b => b.id !== id)
      } : p)
    }));
  };

  const renameExercise = (fromName, toName) => {
    const from = String(fromName || "").trim();
    const to = String(toName || "").trim();
    if (!from || !to || from === to) return;
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const renames = { ...(p.exerciseRenames || {}) };
        for (const [k, v] of Object.entries(renames)) {
          if (k === from || v === from) renames[k] = to;
        }
        renames[from] = to;
        return {
          ...p,
          exerciseRenames: renames,
          customExercises: (p.customExercises || []).map(ex => ex.name === from ? { ...ex, name: to } : ex),
          hiddenExercises: (p.hiddenExercises || []).map(n => n === from ? to : n)
        };
      })
    }));
  };

  const value = {
    state, setState,
    activeProfile,
    replaceState, exportEffectiveState,
    updateProfile, updateMacros, setMacroPreset,
    addProfile, setActiveProfile, deleteProfile,
    addFoodEntry, removeFoodEntry,
    addCustomFoodItem, removeCustomFoodItem,
    addRecipe, updateRecipe, deleteRecipe, importRecipes,
    addCustomExercise, hideExercise, unhideExercise,
    deleteSession, restoreSession, editSession, clearSessionEdit,
    addLoggedSession, removeLoggedSession, upsertLoggedSession,
    updateSessionPlan, clearSessionPlan,
    updateDailyOverride, clearDailyOverride,
    setExerciseAnnotation, clearExerciseAnnotation,
    renameExercise,
    addRoutine, updateRoutine, deleteRoutine, setActiveRoutine,
    addCustomBlock, updateCustomBlock, deleteCustomBlock,
    syncConfig, syncMeta, syncStatus, syncConflict,
    updateSyncConfig, disableSync, pullRemoteState, pushRemoteState, resolveSyncConflict,
    PRESETS, PHASES, DAY_KEYS, DEFAULT_PROGRESSION_RULES
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function useApp() { return useContext(AppContext); }

// Today's day-of-week key based on TODAY constant
function todayDayKey() {
  const today = window.RepsData?.TODAY || "2026-05-21";
  return window.RepsData?.dayName(today) || "Thu";
}

function ageFrom(birthday) {
  if (!birthday) return null;
  const today = window.RepsData?.TODAY || new Date().toISOString().slice(0,10);
  const [by, bm, bd] = birthday.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

window.RepsState = {
  AppStateProvider, useApp, AppContext, todayDayKey, ageFrom,
  DAY_KEYS, PRESETS, PHASES, DEFAULT_PROGRESSION_RULES,
  DEFAULT_HOB_PREFERENCES, STARTER_RECIPE, PASTA_RECIPE, DEFAULT_RECIPE_SEEDS, STORE_KEY
};
