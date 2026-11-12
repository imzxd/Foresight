# Demo script (Demo Mode, about 5 minutes)

1. Run `pnpm dev` and open `/dashboard`. Point out the **Demo Mode** banner: all data is fictional.
2. KPIs and charts: monthly trend (asterisk = month in progress), categories, suppliers.
3. Insight cards: "Packaging expenses increased 18%" shows both amounts and the comparison period; the
   supplier card says _total invoiced spending_, not price; the large-invoice card is a prompt to check, not an accusation.
4. **Invoices** → filter by "needs review". Open the flagged Northwind invoice: validation checks and a link
   to the related (possibly duplicate) invoice.
5. **Forecast Studio**: the baseline is the mean of the last 3 complete months (explained in the panel);
   move growth to +5%, switch 3 / 6 / 12 months. Everything updates instantly with no network calls.
6. **Settings**: inbox address and the honest "Demo — not connected" email status.
7. For live mode follow `docs/setup.md`, forward a PDF invoice to the inbox, and watch it appear.
