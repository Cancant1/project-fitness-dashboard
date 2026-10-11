# Apple Watch → Reps: the morning Shortcut

Every morning, when you stop your alarm, your iPhone sends three things from the Health app to Reps:

- last night's sleep, split into deep, core and REM;
- your latest resting heart rate;
- your latest heart rate variability (HRV).

You set this up once, in about 15 minutes, and after that it runs by itself.

**You need:**

- an iPhone on iOS 17 or 18;
- the Apple Watch worn at night with sleep tracking on;
- the Reps app open in Safari on that iPhone, signed in.

**About the names below:** this guide gives the English names, with the Dutch names in brackets where known. The
Dutch names may differ slightly on your phone. The Shortcuts app is called **Opdrachten** in Dutch, and the Health
app is **Gezondheid**.

---

## Step 1: Make a token in Reps

The token is a password just for this Shortcut. Reps stores only a scrambled version of it, so you will see it once.

1. On the iPhone, open Reps.
2. Go to the **Apple Watch** page. Either:
   - go to **Weight** and tap **Sleep from Apple Watch** under the weigh-in row; or
   - on a computer, use **Apple Watch** at the bottom of the sidebar.
3. Type a name, for example `iPhone`, and tap **Create token**.
4. Tap **Copy token**.
5. Keep this page open. You'll paste the token in Step 2, part 6, and you won't see it again after you leave the page.

Also on this page is the **Shortcut URL** with its own copy button. You'll need it in the same part of Step 2.

> If you lose the token, it doesn't matter: tap **Revoke** next to it and make a new one.

---

## Step 2: Build the Shortcut

Open **Shortcuts** (Opdrachten). Tap **+** at the top right to make a new Shortcut. Tap its name at the top and call
it `Reps sleep`.

To add an action, tap **Add Action** (Voeg taak toe), or the search bar at the bottom, and type the action's name.

### 1. Find last night's sleep

1. Add **Find Health Samples** (Zoek naar gezondheidsgegevens; the name may differ slightly in Dutch).
2. Tap **Type** and choose **Sleep Analysis** (Slaapanalyse).
3. Tap **Add Filter** and set it to: **Start Date** · **is in the last** · `18` · **hours**.
4. Set **Sort by** to **Start Date** and **Order** to **Oldest First**. Leave **Limit** off.

### 2. Turn each sleep piece into a line of text

1. Add **Repeat with Each** (Herhaal met elk). It uses the Health Samples from the action above automatically.
2. Inside the repeat (between **Repeat with Each** and **End Repeat**), add a **Text** action (Tekst).
3. In the Text box, build this line from three variables, with a semicolon `;` between them:

   ```
   [Repeat Item › Value];[Repeat Item › Start Date];[Repeat Item › End Date]
   ```

   For each of the three parts:
   1. Tap in the box. A row of variables appears above the keyboard.
   2. Tap **Repeat Item** (Herhaal-onderdeel) to put it in.
   3. Tap the blue **Repeat Item** bubble you just added. It opens a list of properties:
      - the first part: choose **Value** (Waarde), the sleep stage, like "Core" or "Kern";
      - the second part: choose **Start Date** (Begindatum);
      - the third part: choose **End Date** (Einddatum).

   Type a `;` between the parts.
4. Make the dates easy to read. Tap the **Start Date** bubble again:
   - set **Date Format** (Datumnotatie) to **ISO 8601**;
   - turn **Include ISO 8601 Time** on.

   Do the same for **End Date**. If you skip this, Reps still understands the usual date formats, but ISO is the
   safest.

The finished Text action reads something like `Value;Start Date;End Date`, with the three as blue bubbles.

### 3. Join the lines

1. Below **End Repeat**, add **Combine Text** (Combineer tekst).
2. It should say **Combine Repeat Results with New Lines** (Combineer Herhaalresultaten met Nieuwe regels). If it
   says Spaces, tap that word and choose **New Lines**.

### 4. Resting heart rate

1. Add another **Find Health Samples**.
2. Set **Type** to **Resting Heart Rate** (Rusthartslag).
3. Set **Sort by** to **Start Date**, **Order** to **Latest First**, and turn **Limit** on with `1`.

### 5. Heart rate variability

1. Add another **Find Health Samples**.
2. Set **Type** to **Heart Rate Variability** (Hartslagvariabiliteit).
3. Set **Sort by** to **Start Date**, **Order** to **Latest First**, and turn **Limit** on with `1`.

### 6. Send it to Reps

1. Add **Get Contents of URL** (Haal inhoud van URL op).
2. Tap **URL** and paste the **Shortcut URL** from the Reps page. It ends in `/functions/v1/health-ingest`.
3. Tap **Show More** (Toon meer). Set **Method** (Methode) to **POST**.
4. Under **Headers**, tap **Add new header** (Voeg nieuwe header toe):
   - **Key:** `x-ingest-token`
   - **Text:** paste the token from Step 1
5. Set **Request Body** (Aanvraagtekst) to **JSON**. This part works like a **Dictionary** (Woordenboek). Tap **Add
   new field** three times:

   | Type | Key | Value (tap, then pick the variable) |
   |---|---|---|
   | Text | `sleep_text` | **Combined Text** (from part 3) |
   | Number | `resting_hr` | **Health Samples** from part 4 |
   | Number | `hrv_sdnn_ms` | **Health Samples** from part 5 |

   For the two **Health Samples** values:
   - Shortcuts shows both as "Health Samples". Pick the one from part 4 for the heart rate and the one from part 5
     for HRV. When you pick a variable, Shortcuts shows the actions above it; tap the right one.
   - Then tap the bubble and choose **Value** (Waarde), so only the number is sent.

   Type the keys exactly as shown: lower case, with underscores.

**Optional, for testing:** add **Show Result** (Toon resultaat) at the very end. It shows what Reps answered. You can
remove it later.

Tap **Done** (Gereed).

> **Another way to build part 6:** add a separate **Dictionary** action with the same three keys, then in **Get
> Contents of URL** set **Request Body** to **File** and choose the **Dictionary**. Reps accepts both.

---

## Step 3: Test it by hand

1. In Shortcuts, tap the **Reps sleep** tile, or the ▶ button inside the Shortcut.
2. The first time, iOS asks for permissions. Allow all three:
   - access to **Sleep**, **Resting Heart Rate** and **Heart Rate Variability** in Health. Tap **Allow**, or **Turn
     On All**, then **Allow**;
   - connecting to `….supabase.co`. Tap **Always Allow** (Sta altijd toe). If you choose "Allow Once", the morning
     automation will stop and ask again.
3. With **Show Result** on, you should see something like:

   ```
   ok: true · date: 2026-10-12 · sleep_total_min: 431 · resting_hr: 52 · hrv_sdnn_ms: 48
   ```

   `sleep_total_min` is in minutes: 431 minutes is 7 h 11 min.
4. In Reps, open the **Apple Watch** page and tap **Refresh**. Last night appears under **Last 7 nights**, with sleep
   in hours, resting heart rate and HRV. Your token's **used** time changes to just now.

You can run it as often as you like. It updates the same day each time; it never adds duplicates.

---

## Step 4: Run it every morning by itself

1. In Shortcuts, go to the **Automation** tab (Automatisering) at the bottom.
2. Tap **+** (or **New Automation**, Nieuwe automatisering).
3. Choose **Alarm** (Wekker).
4. Choose **Is Stopped** (Wordt gestopt). Leave it on **Any Alarm**, or pick your wake-up alarm.
5. Choose **Run Immediately** (Voer direct uit). Turn **Notify When Run** (Meld bij uitvoering) **off**. The names may
   differ slightly in Dutch.
6. Tap **Next**, choose **Reps sleep**, and tap **Done**.

**Recommended backup:** add a second automation that runs at a fixed time. It catches mornings when the Watch had not
finished sending its sleep data yet, or when you had no alarm.

1. Tap **+**, choose **Time of Day** (Tijdstip), and set a time like `09:30`, **Daily**.
2. Choose **Run Immediately**, then **Reps sleep**.

Running it twice in one morning is fine: the second run updates the same day.

---

## Troubleshooting

| What you see | What to do |
|---|---|
| **Unknown or revoked token** (401) | The token is mistyped or was revoked. In Reps, make a new token and paste it again into the `x-ingest-token` header. Check the header key is exactly `x-ingest-token`. |
| **Nothing to save** (422) | No usable data came through. Check, in this order: (1) Settings → Privacy & Security → Health → Shortcuts: Sleep, Resting Heart Rate and HRV are allowed. (2) The keys in Request Body are spelled exactly `sleep_text`, `resting_hr`, `hrv_sdnn_ms`. (3) The Health app shows sleep for last night. |
| Sleep is empty, but heart rate and HRV came through | The Watch may not have sent last night's sleep to the iPhone yet. That usually takes a few minutes after you wake up. Add the 09:30 backup automation, or put a **Wait** action (Wacht) of 120 seconds at the top of the Shortcut. Also check that Sleep tracking is on in the Watch app. |
| A warning says "only In Bed was sent" | The iPhone logged time in bed, but the Watch logged no sleep: maybe it wasn't worn, or its battery ran out. |
| Sleep looks too short or too long | Tap **Show Result** and read `warnings`: they list lines Reps couldn't read. Make sure the Text in part 2 has the three parts in the right order (stage; start; end) with `;` between them. Naps earlier in the day are left out on purpose. |
| Resting HR or HRV is missing or strange | Tap the Health Samples bubble in Request Body and choose **Value** (Waarde). Check you picked part 4's samples for `resting_hr` and part 5's for `hrv_sdnn_ms`. |
| The stage shows as a number (0–5) or in Dutch | That's fine. Reps understands English, Dutch (Kern, Diep, Wakker, In bed, Slaap) and Apple's numbers. |
| "Could not connect to the server" | No internet, or the URL is wrong. Copy the Shortcut URL from the Reps page again. |
| The automation doesn't run, or asks first | Open the automation and make sure **Run Immediately** is chosen. If it asks "Allow … to connect?", run the Shortcut once by hand and tap **Always Allow**. |
| It fails while the iPhone is locked | iOS can block Health data while the phone is locked. Unlock the phone after stopping the alarm, or rely on the 09:30 backup, which runs when the phone is usually unlocked. |
| You want to stop it | Reps → Apple Watch → **Revoke**. The Shortcut then gets "Unknown or revoked token" and saves nothing. Delete or turn off the automation in Shortcuts. |

**What is sent:** only the three values above. Reps saves them with your account, under the morning the night ended
(Dutch time). No other Health data leaves the phone.
