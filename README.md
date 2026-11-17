# Cow Farm records

Mobile-first web app for the farm: cows and calves with their own accounts, daily milk per cow (kg),
milk sales, expenses, staff salary accounts, partner capital and automatic profit split.

- Languages: Pashto (default), Dari, English
- Works offline: entries are kept on the phone and uploaded when internet returns
- Money in AFN; capital in USD; AFN/USD rate refreshed daily

## Run
```
npm install
cp .env.example .env   # fill in Supabase URL and anon key, or leave empty for demo mode
npm run dev
```

## Database
Apply `supabase/migrations/0001_init.sql` to a Supabase project. Create users in Supabase Auth with
emails like `alawodin@cowfarm.app` (they log in with the username `alawodin`), then add a row in
`profiles` with role `admin` (Fahim), `manager` (Alawodin) or `viewer` (Haji Zahir).

## Rules used in the numbers
- Shared costs are spread over the days they cover and split across animals on the farm each day; a calf counts as half a cow.
- Each cow's milk is valued at the average sale price per kg in the period.
- Profit = milk sales + animal sales − purchase price of animals that left − expenses.
- Each day's profit is split by each partner's capital on that day.
