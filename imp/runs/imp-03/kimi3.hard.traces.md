# desk traces

### ✓ h02 — How much would ana@example.com be refunded for order P-202, in their local currency?
expected `331.20 EUR` · got `331.20 EUR` · ended: submit

    1. find_customer({"email":"ana@example.com"}) → {"country":"ES","email":"ana@example.com","id":"H1","name":"Ana Ruiz","tier":"gold"}
    1. get_order({"order_id":"P-202"}) → {"amount_usd":400.0,"category":"electronics","customer_id":"H1","delivered_date":"2026-09-09","id":"P-202","opened":true,"order_date":"2026-09-05","status":"del
    2. refund_policy({"category":"electronics","order_date":"2026-09-05","tier":"gold"}) → {"category":"electronics","percent":100,"restocking_fee_percent_if_opened":10,"tier":"gold","version":"v2","window_days":21}
    2. days_since({"date":"2026-09-09"}) → {"days":18,"today":"2026-09-27"}
    3. convert({"amount_usd":360,"to":"ES"}) → {"amount":331.2,"currency":"EUR","rate":0.92}
    4. submit({"answer":"331.20 EUR","work":"Ana (H1, gold, ES); order P-202 electronics $400, delivered 2026-09-09 (18 days ago, within 21-day window), opened; policy v2: 10) → {"answer":"331.20 EUR","work":"Ana (H1, gold, ES); order P-202 electronics $400, delivered 2026-09-09 (18 days ago, within 21-day window), opened; policy v2: 10

### ✓ h04 — How much would ben@example.com be refunded for order P-204, in their local currency?
expected `553.00 GBP` · got `553.00 GBP` · ended: submit

    1. find_customer({"email":"ben@example.com"}) → {"country":"GB","email":"ben@example.com","id":"H2","name":"Ben Okafor","tier":"standard"}
    1. get_order({"order_id":"P-204"}) → {"amount_usd":700.0,"category":"furniture","customer_id":"H2","delivered_date":null,"id":"P-204","opened":false,"order_date":"2026-09-20","status":"shipped"}
    2. convert({"amount_usd":700,"to":"GBP"}) → {"amount":553.0,"currency":"GBP","rate":0.79}
    3. submit({"answer":"553.00 GBP","work":"Order P-204 (customer H2/Ben, GB, standard tier) is status \"shipped\" with delivered_date=null, so the not-yet-delivered rule ap) → {"answer":"553.00 GBP","work":"Order P-204 (customer H2/Ben, GB, standard tier) is status \"shipped\" with delivered_date=null, so the not-yet-delivered rule ap

### ✓ h06 — How much would chen@example.com be refunded for order P-206, in their local currency?
expected `0.00 USD` · got `0.00 USD` · ended: submit

    1. find_customer({"email":"chen@example.com"}) → {"country":"US","email":"chen@example.com","id":"H3","name":"Chen Wei","tier":"standard"}
    1. get_order({"order_id":"P-206"}) → {"amount_usd":250.0,"category":"electronics","customer_id":"H3","delivered_date":"2026-09-04","id":"P-206","opened":false,"order_date":"2026-09-01","status":"de
    2. refund_policy({"category":"electronics","order_date":"2026-09-01","tier":"standard"}) → {"category":"electronics","percent":90,"restocking_fee_percent_if_opened":10,"tier":"standard","version":"v2","window_days":21}
    2. days_since({"date":"2026-09-04"}) → {"days":23,"today":"2026-09-27"}
    3. submit({"answer":"0.00 USD","work":"Chen Wei (standard, US); order P-206 electronics $250.00, delivered 2026-09-04, not opened, status delivered; policy v2: 21-day win) → {"answer":"0.00 USD","work":"Chen Wei (standard, US); order P-206 electronics $250.00, delivered 2026-09-04, not opened, status delivered; policy v2: 21-day win

### ✓ h08 — How much would dara@example.com be refunded for order P-208, in their local currency?
expected `0.00 USD` · got `0.00 USD` · ended: submit

    1. find_customer({"email":"dara@example.com"}) → {"country":"US","email":"dara@example.com","id":"H4","name":"Dara Kim","tier":"gold"}
    1. get_order({"order_id":"P-208"}) → {"amount_usd":40.0,"category":"books","customer_id":"H4","delivered_date":"2026-09-19","id":"P-208","opened":false,"order_date":"2026-09-15","status":"returned"
    2. submit({"answer":"0.00 USD","work":"Customer H4 (Dara Kim, gold, US) found via find_customer; order P-208 (books, $40.00 USD, status \"returned\") via get_order — a re) → {"answer":"0.00 USD","work":"Customer H4 (Dara Kim, gold, US) found via find_customer; order P-208 (books, $40.00 USD, status \"returned\") via get_order — a re

### ✓ h10 — How much would emil@example.com be refunded for order P-210, in their local currency?
expected `184.00 EUR` · got `184.00 EUR` · ended: submit

    1. find_customer({"email":"emil@example.com"}) → {"country":"DE","email":"emil@example.com","id":"H5","name":"Emil Brandt","tier":"platinum"}
    1. get_order({"order_id":"P-210"}) → {"amount_usd":200.0,"category":"apparel","customer_id":"H5","delivered_date":"2026-08-03","id":"P-210","opened":false,"order_date":"2026-07-30","status":"delive
    2. refund_policy({"category":"apparel","order_date":"2026-07-30","tier":"platinum"}) → {"category":"apparel","percent":100,"restocking_fee_percent_if_opened":0,"tier":"platinum","version":"v1","window_days":60}
    2. days_since({"date":"2026-08-03"}) → {"days":55,"today":"2026-09-27"}
    3. convert({"amount_usd":200,"to":"DE"}) → {"amount":184.0,"currency":"EUR","rate":0.92}
    4. submit({"answer":"184.00 EUR","work":"Emil Brandt (platinum, DE); order P-210 apparel $200 delivered 2026-08-03, not opened; policy v1: 100% refund, 60-day window, 55 ) → {"answer":"184.00 EUR","work":"Emil Brandt (platinum, DE); order P-210 apparel $200 delivered 2026-08-03, not opened; policy v1: 100% refund, 60-day window, 55 

### ✓ h12 — How much would fumi@example.com be refunded for order P-212, in their local currency?
expected `0.00 JPY` · got `0.00 JPY` · ended: submit

    1. find_customer({"email":"fumi@example.com"}) → {"country":"JP","email":"fumi@example.com","id":"H6","name":"Fumi Sato","tier":"standard"}
    1. get_order({"order_id":"P-212"}) → {"amount_usd":60.0,"category":"books","customer_id":"H6","delivered_date":"2026-09-11","id":"P-212","opened":false,"order_date":"2026-09-10","status":"delivered
    2. refund_policy({"category":"books","order_date":"2026-09-10","tier":"standard"}) → {"category":"books","percent":100,"restocking_fee_percent_if_opened":0,"tier":"standard","version":"v2","window_days":14}
    2. days_since({"date":"2026-09-11"}) → {"days":16,"today":"2026-09-27"}
    3. submit({"answer":"0.00 JPY","work":"Customer H6 (standard, JP); order P-212 books $60.00 delivered 2026-09-11, status delivered; policy v2 window 14 days, 100%; days_s) → {"answer":"0.00 JPY","work":"Customer H6 (standard, JP); order P-212 books $60.00 delivered 2026-09-11, status delivered; policy v2 window 14 days, 100%; days_s

### ✓ h14 — How much would gus@example.com be refunded for order P-214, in their local currency?
expected `474.00 GBP` · got `474.00 GBP` · ended: submit

    1. find_customer({"email":"gus@example.com"}) → {"country":"GB","email":"gus@example.com","id":"H7","name":"Gus Hale","tier":"platinum"}
    1. get_order({"order_id":"P-214"}) → {"amount_usd":600.0,"category":"electronics","customer_id":"H7","delivered_date":null,"id":"P-214","opened":true,"order_date":"2026-09-18","status":"shipped"}
    2. refund_policy({"category":"electronics","order_date":"2026-09-18","tier":"platinum"}) → {"category":"electronics","percent":100,"restocking_fee_percent_if_opened":10,"tier":"platinum","version":"v2","window_days":21}
    2. convert({"amount_usd":600,"to":"GB"}) → {"amount":474.0,"currency":"GBP","rate":0.79}
    3. submit({"answer":"474.00 GBP","work":"Used customer H7 (platinum, GB), order P-214 (electronics, $600.00, status shipped, delivered_date null, opened true), policy v2,) → {"answer":"474.00 GBP","work":"Used customer H7 (platinum, GB), order P-214 (electronics, $600.00, status shipped, delivered_date null, opened true), policy v2,

### ✓ h16 — How much would hana@example.com be refunded for order P-216, in their local currency?
expected `11960.00 JPY` · got `11960.00 JPY` · ended: submit

    1. find_customer({"email":"hana@example.com"}) → {"country":"JP","email":"hana@example.com","id":"H8","name":"Hana Mori","tier":"gold"}
    1. get_order({"order_id":"P-216"}) → {"amount_usd":80.0,"category":"apparel","customer_id":"H8","delivered_date":"2026-09-24","id":"P-216","opened":false,"order_date":"2026-09-21","status":"deliver
    2. refund_policy({"category":"apparel","order_date":"2026-09-21","tier":"gold"}) → {"category":"apparel","percent":100,"restocking_fee_percent_if_opened":0,"tier":"gold","version":"v2","window_days":60}
    2. days_since({"date":"2026-09-24"}) → {"days":3,"today":"2026-09-27"}
    3. convert({"amount_usd":80.0,"to":"JP"}) → {"amount":11960.0,"currency":"JPY","rate":149.5}
    4. submit({"answer":"11960.00 JPY","work":"Hana Mori (H8, gold, JP); order P-216 apparel, delivered 2026-09-24 (3 days ago), not opened, $80.00; policy v2 gold apparel: 1) → {"answer":"11960.00 JPY","work":"Hana Mori (H8, gold, JP); order P-216 apparel, delivered 2026-09-24 (3 days ago), not opened, $80.00; policy v2 gold apparel: 1

### ✓ h18 — Is order P-205 eligible for a refund today? Answer yes or no.
expected `yes` · got `yes` · ended: submit

    1. get_order({"order_id":"P-205"}) → {"amount_usd":250.0,"category":"electronics","customer_id":"H3","delivered_date":"2026-09-02","id":"P-205","opened":false,"order_date":"2026-08-29","status":"de
    2. list_customers({}) → {"customers":[{"country":"ES","email":"ana@example.com","id":"H1","tier":"gold"},{"country":"GB","email":"ben@example.com","id":"H2","tier":"standard"},{"countr
    2. days_since({"date":"2026-09-02"}) → {"days":25,"today":"2026-09-27"}
    3. refund_policy({"category":"electronics","order_date":"2026-08-29","tier":"standard"}) → {"category":"electronics","percent":90,"restocking_fee_percent_if_opened":15,"tier":"standard","version":"v1","window_days":30}
    4. submit({"answer":"yes","work":"P-205: status=delivered, delivered_date=2026-09-02 (25 days ago), category=electronics, opened=false; customer H3 tier=standard; policy ) → {"answer":"yes","work":"P-205: status=delivered, delivered_date=2026-09-02 (25 days ago), category=electronics, opened=false; customer H3 tier=standard; policy 

### ✓ h20 — Is order P-212 eligible for a refund today? Answer yes or no.
expected `no` · got `no` · ended: submit

    1. get_order({"order_id":"P-212"}) → {"amount_usd":60.0,"category":"books","customer_id":"H6","delivered_date":"2026-09-11","id":"P-212","opened":false,"order_date":"2026-09-10","status":"delivered
    2. list_customers({}) → {"customers":[{"country":"ES","email":"ana@example.com","id":"H1","tier":"gold"},{"country":"GB","email":"ben@example.com","id":"H2","tier":"standard"},{"countr
    2. days_since({"date":"2026-09-11"}) → {"days":16,"today":"2026-09-27"}
    3. refund_policy({"category":"books","order_date":"2026-09-10","tier":"standard"}) → {"category":"books","percent":100,"restocking_fee_percent_if_opened":0,"tier":"standard","version":"v2","window_days":14}
    4. submit({"answer":"no","work":"Order P-212 (books, delivered 2026-09-11, status delivered); customer H6 is standard tier; policy v2 window = 14 days from delivery; 16 d) → {"answer":"no","work":"Order P-212 (books, delivered 2026-09-11, status delivered); customer H6 is standard tier; policy v2 window = 14 days from delivery; 16 d

### ✓ h22 — Is order P-214 eligible for a refund today? Answer yes or no.
expected `yes` · got `yes` · ended: submit

    1. get_order({"order_id":"P-214"}) → {"amount_usd":600.0,"category":"electronics","customer_id":"H7","delivered_date":null,"id":"P-214","opened":true,"order_date":"2026-09-18","status":"shipped"}
    2. submit({"answer":"yes","work":"Used get_order(P-214): status=shipped, delivered_date=null (not delivered, not returned/cancelled), category=electronics, order_date=202) → {"answer":"yes","work":"Used get_order(P-214): status=shipped, delivered_date=null (not delivered, not returned/cancelled), category=electronics, order_date=202

### ✓ h24 — Is order P-208 eligible for a refund today? Answer yes or no.
expected `no` · got `no` · ended: submit

    1. get_order({"order_id":"P-208"}) → {"amount_usd":40.0,"category":"books","customer_id":"H4","delivered_date":"2026-09-19","id":"P-208","opened":false,"order_date":"2026-09-15","status":"returned"
    2. submit({"answer":"no","work":"Order P-208 status is \"returned\", and a returned order is not eligible for a refund."}) → {"answer":"no","work":"Order P-208 status is \"returned\", and a returned order is not eligible for a refund."}

### ✓ h26 — What is the total refund ben@example.com could get right now across all their orders, in their local currency?
expected `647.80 GBP` · got `647.80 GBP` · ended: submit

    1. find_customer({"email":"ben@example.com"}) → {"country":"GB","email":"ben@example.com","id":"H2","name":"Ben Okafor","tier":"standard"}
    2. list_orders({"customer_id":"H2"}) → {"order_ids":["P-203","P-204"]}
    3. get_order({"order_id":"P-203"}) → {"amount_usd":120.0,"category":"apparel","customer_id":"H2","delivered_date":"2026-09-15","id":"P-203","opened":false,"order_date":"2026-09-12","status":"delive
    3. get_order({"order_id":"P-204"}) → {"amount_usd":700.0,"category":"furniture","customer_id":"H2","delivered_date":null,"id":"P-204","opened":false,"order_date":"2026-09-20","status":"shipped"}
    4. refund_policy({"category":"apparel","order_date":"2026-09-12","tier":"standard"}) → {"category":"apparel","percent":100,"restocking_fee_percent_if_opened":0,"tier":"standard","version":"v2","window_days":60}
    4. refund_policy({"category":"furniture","order_date":"2026-09-20","tier":"standard"}) → {"category":"furniture","percent":85,"restocking_fee_percent_if_opened":0,"tier":"standard","version":"v2","window_days":45}
    4. days_since({"date":"2026-09-15"}) → {"days":12,"today":"2026-09-27"}
    5. convert({"amount_usd":820,"to":"GB"}) → {"amount":647.8,"currency":"GBP","rate":0.79}
    6. submit({"answer":"647.80 GBP","work":"Ben H2 (GB, standard): P-203 apparel $120 delivered 2026-09-15 (12 days ago, within 60-day window, policy v2 100%, unopened no fe) → {"answer":"647.80 GBP","work":"Ben H2 (GB, standard): P-203 apparel $120 delivered 2026-09-15 (12 days ago, within 60-day window, policy v2 100%, unopened no fe

### ✓ h28 — What is the total refund dara@example.com could get right now across all their orders, in their local currency?
expected `1080.00 USD` · got `1080.00 USD` · ended: submit

    1. find_customer({"email":"dara@example.com"}) → {"country":"US","email":"dara@example.com","id":"H4","name":"Dara Kim","tier":"gold"}
    2. list_orders({"customer_id":"H4"}) → {"order_ids":["P-207","P-208"]}
    3. get_order({"order_id":"P-207"}) → {"amount_usd":1.2e3,"category":"furniture","customer_id":"H4","delivered_date":"2026-09-10","id":"P-207","opened":false,"order_date":"2026-09-02","status":"deli
    3. get_order({"order_id":"P-208"}) → {"amount_usd":40.0,"category":"books","customer_id":"H4","delivered_date":"2026-09-19","id":"P-208","opened":false,"order_date":"2026-09-15","status":"returned"
    4. refund_policy({"category":"furniture","order_date":"2026-09-02","tier":"gold"}) → {"category":"furniture","percent":90,"restocking_fee_percent_if_opened":0,"tier":"gold","version":"v2","window_days":45}
    4. days_since({"date":"2026-09-10"}) → {"days":17,"today":"2026-09-27"}
    5. submit({"answer":"1080.00 USD","work":"Dara Kim (H4, gold, US); P-207 furniture $1200 delivered 2026-09-10 (17 days ago, within 45-day window, not opened) → 90% = $108) → {"answer":"1080.00 USD","work":"Dara Kim (H4, gold, US); P-207 furniture $1200 delivered 2026-09-10 (17 days ago, within 45-day window, not opened) → 90% = $108

### ✓ h30 — What is the total refund fumi@example.com could get right now across all their orders, in their local currency?
expected `4485.00 JPY` · got `4485.00 JPY` · ended: submit

    1. find_customer({"email":"fumi@example.com"}) → {"country":"JP","email":"fumi@example.com","id":"H6","name":"Fumi Sato","tier":"standard"}
    2. list_orders({"customer_id":"H6"}) → {"order_ids":["P-212","P-211"]}
    3. get_order({"order_id":"P-212"}) → {"amount_usd":60.0,"category":"books","customer_id":"H6","delivered_date":"2026-09-11","id":"P-212","opened":false,"order_date":"2026-09-10","status":"delivered
    3. get_order({"order_id":"P-211"}) → {"amount_usd":30.0,"category":"books","customer_id":"H6","delivered_date":"2026-09-16","id":"P-211","opened":false,"order_date":"2026-09-14","status":"delivered
    4. refund_policy({"category":"books","order_date":"2026-09-10","tier":"standard"}) → {"category":"books","percent":100,"restocking_fee_percent_if_opened":0,"tier":"standard","version":"v2","window_days":14}
    4. refund_policy({"category":"books","order_date":"2026-09-14","tier":"standard"}) → {"category":"books","percent":100,"restocking_fee_percent_if_opened":0,"tier":"standard","version":"v2","window_days":14}
    4. days_since({"date":"2026-09-11"}) → {"days":16,"today":"2026-09-27"}
    4. days_since({"date":"2026-09-16"}) → {"days":11,"today":"2026-09-27"}
    5. convert({"amount_usd":30.0,"to":"JPY"}) → {"amount":4485.0,"currency":"JPY","rate":149.5}
    6. submit({"answer":"4485.00 JPY","work":"Fumi Sato (H6, standard, JP) has 2 orders: P-212 ($60 books, delivered 2026-09-11 = 16 days ago, outside 14-day window → 0) and ) → {"answer":"4485.00 JPY","work":"Fumi Sato (H6, standard, JP) has 2 orders: P-212 ($60 books, delivered 2026-09-11 = 16 days ago, outside 14-day window → 0) and 

### ✓ h32 — What is the total refund hana@example.com could get right now across all their orders, in their local currency?
expected `59052.50 JPY` · got `59052.50 JPY` · ended: submit

    1. find_customer({"email":"hana@example.com"}) → {"country":"JP","email":"hana@example.com","id":"H8","name":"Hana Mori","tier":"gold"}
    2. list_orders({"customer_id":"H8"}) → {"order_ids":["P-215","P-216"]}
    3. get_order({"order_id":"P-215"}) → {"amount_usd":350.0,"category":"electronics","customer_id":"H8","delivered_date":"2026-09-06","id":"P-215","opened":true,"order_date":"2026-09-03","status":"del
    3. get_order({"order_id":"P-216"}) → {"amount_usd":80.0,"category":"apparel","customer_id":"H8","delivered_date":"2026-09-24","id":"P-216","opened":false,"order_date":"2026-09-21","status":"deliver
    4. refund_policy({"category":"electronics","order_date":"2026-09-03","tier":"gold"}) → {"category":"electronics","percent":100,"restocking_fee_percent_if_opened":10,"tier":"gold","version":"v2","window_days":21}
    4. refund_policy({"category":"apparel","order_date":"2026-09-21","tier":"gold"}) → {"category":"apparel","percent":100,"restocking_fee_percent_if_opened":0,"tier":"gold","version":"v2","window_days":60}
    4. days_since({"date":"2026-09-06"}) → {"days":21,"today":"2026-09-27"}
    4. days_since({"date":"2026-09-24"}) → {"days":3,"today":"2026-09-27"}
    5. convert({"amount_usd":395,"to":"JPY"}) → {"amount":59052.5,"currency":"JPY","rate":149.5}
    6. submit({"answer":"59052.50 JPY","work":"Hana Mori (H8, gold, JP→JPY). P-215 electronics $350, delivered 2026-09-06 (21d ago, within 21d window), opened → 100% refund m) → {"answer":"59052.50 JPY","work":"Hana Mori (H8, gold, JP→JPY). P-215 electronics $350, delivered 2026-09-06 (21d ago, within 21d window), opened → 100% refund m

### ✓ h34 — How many platinum customers have at least one order eligible for a refund today?
expected `2` · got `2` · ended: submit

    1. list_customers({}) → {"customers":[{"country":"ES","email":"ana@example.com","id":"H1","tier":"gold"},{"country":"GB","email":"ben@example.com","id":"H2","tier":"standard"},{"countr
    2. list_orders({"customer_id":"H5"}) → {"order_ids":["P-210","P-209"]}
    2. list_orders({"customer_id":"H7"}) → {"order_ids":["P-213","P-214"]}
    3. get_order({"order_id":"P-210"}) → {"amount_usd":200.0,"category":"apparel","customer_id":"H5","delivered_date":"2026-08-03","id":"P-210","opened":false,"order_date":"2026-07-30","status":"delive
    3. get_order({"order_id":"P-209"}) → {"amount_usd":900.0,"category":"electronics","customer_id":"H5","delivered_date":"2026-09-12","id":"P-209","opened":true,"order_date":"2026-09-08","status":"del
    3. get_order({"order_id":"P-213"}) → {"amount_usd":1.5e3,"category":"furniture","customer_id":"H7","delivered_date":"2026-08-20","id":"P-213","opened":false,"order_date":"2026-08-15","status":"deli
    3. get_order({"order_id":"P-214"}) → {"amount_usd":600.0,"category":"electronics","customer_id":"H7","delivered_date":null,"id":"P-214","opened":true,"order_date":"2026-09-18","status":"shipped"}
    4. refund_policy({"category":"apparel","order_date":"2026-07-30","tier":"platinum"}) → {"category":"apparel","percent":100,"restocking_fee_percent_if_opened":0,"tier":"platinum","version":"v1","window_days":60}
    4. refund_policy({"category":"electronics","order_date":"2026-09-08","tier":"platinum"}) → {"category":"electronics","percent":100,"restocking_fee_percent_if_opened":10,"tier":"platinum","version":"v2","window_days":21}
    4. refund_policy({"category":"furniture","order_date":"2026-08-15","tier":"platinum"}) → {"category":"furniture","percent":100,"restocking_fee_percent_if_opened":0,"tier":"platinum","version":"v1","window_days":30}
    4. days_since({"date":"2026-08-03"}) → {"days":55,"today":"2026-09-27"}
    4. days_since({"date":"2026-09-12"}) → {"days":15,"today":"2026-09-27"}
    4. days_since({"date":"2026-08-20"}) → {"days":38,"today":"2026-09-27"}
    5. submit({"answer":"2","work":"Platinum customers H5 and H7; H5 P-210 apparel delivered 2026-08-03 (55 days ≤ 60-day window, 100%) eligible; H7 P-213 furniture delivered) → {"answer":"2","work":"Platinum customers H5 and H7; H5 P-210 apparel delivered 2026-08-03 (55 days ≤ 60-day window, 100%) eligible; H7 P-213 furniture delivered

### ✓ h36 — Which single order would refund the most right now, measured in USD? Answer with the order id.
expected `P-207` · got `P-207` · ended: submit

    1. list_customers({}) → {"customers":[{"country":"ES","email":"ana@example.com","id":"H1","tier":"gold"},{"country":"GB","email":"ben@example.com","id":"H2","tier":"standard"},{"countr
    2. list_orders({"customer_id":"H1"}) → {"order_ids":["P-201","P-202"]}
    2. list_orders({"customer_id":"H2"}) → {"order_ids":["P-203","P-204"]}
    2. list_orders({"customer_id":"H3"}) → {"order_ids":["P-205","P-206"]}
    2. list_orders({"customer_id":"H4"}) → {"order_ids":["P-207","P-208"]}
    2. list_orders({"customer_id":"H5"}) → {"order_ids":["P-210","P-209"]}
    2. list_orders({"customer_id":"H6"}) → {"order_ids":["P-212","P-211"]}
    2. list_orders({"customer_id":"H7"}) → {"order_ids":["P-213","P-214"]}
    2. list_orders({"customer_id":"H8"}) → {"order_ids":["P-215","P-216"]}
    3. get_order({"order_id":"P-201"}) → {"amount_usd":300.0,"category":"electronics","customer_id":"H1","delivered_date":"2026-08-25","id":"P-201","opened":true,"order_date":"2026-08-20","status":"del
    3. get_order({"order_id":"P-202"}) → {"amount_usd":400.0,"category":"electronics","customer_id":"H1","delivered_date":"2026-09-09","id":"P-202","opened":true,"order_date":"2026-09-05","status":"del
    3. get_order({"order_id":"P-203"}) → {"amount_usd":120.0,"category":"apparel","customer_id":"H2","delivered_date":"2026-09-15","id":"P-203","opened":false,"order_date":"2026-09-12","status":"delive
    3. get_order({"order_id":"P-204"}) → {"amount_usd":700.0,"category":"furniture","customer_id":"H2","delivered_date":null,"id":"P-204","opened":false,"order_date":"2026-09-20","status":"shipped"}
    3. get_order({"order_id":"P-205"}) → {"amount_usd":250.0,"category":"electronics","customer_id":"H3","delivered_date":"2026-09-02","id":"P-205","opened":false,"order_date":"2026-08-29","status":"de
    3. get_order({"order_id":"P-206"}) → {"amount_usd":250.0,"category":"electronics","customer_id":"H3","delivered_date":"2026-09-04","id":"P-206","opened":false,"order_date":"2026-09-01","status":"de
    3. get_order({"order_id":"P-207"}) → {"amount_usd":1.2e3,"category":"furniture","customer_id":"H4","delivered_date":"2026-09-10","id":"P-207","opened":false,"order_date":"2026-09-02","status":"deli
    3. get_order({"order_id":"P-208"}) → {"amount_usd":40.0,"category":"books","customer_id":"H4","delivered_date":"2026-09-19","id":"P-208","opened":false,"order_date":"2026-09-15","status":"returned"
    3. get_order({"order_id":"P-209"}) → {"amount_usd":900.0,"category":"electronics","customer_id":"H5","delivered_date":"2026-09-12","id":"P-209","opened":true,"order_date":"2026-09-08","status":"del
    3. get_order({"order_id":"P-210"}) → {"amount_usd":200.0,"category":"apparel","customer_id":"H5","delivered_date":"2026-08-03","id":"P-210","opened":false,"order_date":"2026-07-30","status":"delive
    3. get_order({"order_id":"P-211"}) → {"amount_usd":30.0,"category":"books","customer_id":"H6","delivered_date":"2026-09-16","id":"P-211","opened":false,"order_date":"2026-09-14","status":"delivered
    3. get_order({"order_id":"P-212"}) → {"amount_usd":60.0,"category":"books","customer_id":"H6","delivered_date":"2026-09-11","id":"P-212","opened":false,"order_date":"2026-09-10","status":"delivered
    3. get_order({"order_id":"P-213"}) → {"amount_usd":1.5e3,"category":"furniture","customer_id":"H7","delivered_date":"2026-08-20","id":"P-213","opened":false,"order_date":"2026-08-15","status":"deli
    3. get_order({"order_id":"P-214"}) → {"amount_usd":600.0,"category":"electronics","customer_id":"H7","delivered_date":null,"id":"P-214","opened":true,"order_date":"2026-09-18","status":"shipped"}
    3. get_order({"order_id":"P-215"}) → {"amount_usd":350.0,"category":"electronics","customer_id":"H8","delivered_date":"2026-09-06","id":"P-215","opened":true,"order_date":"2026-09-03","status":"del
    3. get_order({"order_id":"P-216"}) → {"amount_usd":80.0,"category":"apparel","customer_id":"H8","delivered_date":"2026-09-24","id":"P-216","opened":false,"order_date":"2026-09-21","status":"deliver
    4. refund_policy({"category":"electronics","order_date":"2026-08-20","tier":"gold"}) → {"category":"electronics","percent":100,"restocking_fee_percent_if_opened":15,"tier":"gold","version":"v1","window_days":30}
    4. refund_policy({"category":"electronics","order_date":"2026-09-05","tier":"gold"}) → {"category":"electronics","percent":100,"restocking_fee_percent_if_opened":10,"tier":"gold","version":"v2","window_days":21}
    4. refund_policy({"category":"apparel","order_date":"2026-09-12","tier":"standard"}) → {"category":"apparel","percent":100,"restocking_fee_percent_if_opened":0,"tier":"standard","version":"v2","window_days":60}
    4. refund_policy({"category":"electronics","order_date":"2026-08-29","tier":"standard"}) → {"category":"electronics","percent":90,"restocking_fee_percent_if_opened":15,"tier":"standard","version":"v1","window_days":30}
    4. refund_policy({"category":"electronics","order_date":"2026-09-01","tier":"standard"}) → {"category":"electronics","percent":90,"restocking_fee_percent_if_opened":10,"tier":"standard","version":"v2","window_days":21}
    4. refund_policy({"category":"furniture","order_date":"2026-09-02","tier":"gold"}) → {"category":"furniture","percent":90,"restocking_fee_percent_if_opened":0,"tier":"gold","version":"v2","window_days":45}
    4. refund_policy({"category":"electronics","order_date":"2026-09-08","tier":"platinum"}) → {"category":"electronics","percent":100,"restocking_fee_percent_if_opened":10,"tier":"platinum","version":"v2","window_days":21}
    4. refund_policy({"category":"apparel","order_date":"2026-07-30","tier":"platinum"}) → {"category":"apparel","percent":100,"restocking_fee_percent_if_opened":0,"tier":"platinum","version":"v1","window_days":60}
    4. refund_policy({"category":"books","order_date":"2026-09-14","tier":"standard"}) → {"category":"books","percent":100,"restocking_fee_percent_if_opened":0,"tier":"standard","version":"v2","window_days":14}
    4. refund_policy({"category":"books","order_date":"2026-09-10","tier":"standard"}) → {"category":"books","percent":100,"restocking_fee_percent_if_opened":0,"tier":"standard","version":"v2","window_days":14}
    4. refund_policy({"category":"furniture","order_date":"2026-08-15","tier":"platinum"}) → {"category":"furniture","percent":100,"restocking_fee_percent_if_opened":0,"tier":"platinum","version":"v1","window_days":30}
    4. refund_policy({"category":"electronics","order_date":"2026-09-03","tier":"gold"}) → {"category":"electronics","percent":100,"restocking_fee_percent_if_opened":10,"tier":"gold","version":"v2","window_days":21}
    4. refund_policy({"category":"apparel","order_date":"2026-09-21","tier":"gold"}) → {"category":"apparel","percent":100,"restocking_fee_percent_if_opened":0,"tier":"gold","version":"v2","window_days":60}
    5. days_since({"date":"2026-08-25"}) → {"days":33,"today":"2026-09-27"}
    5. days_since({"date":"2026-09-09"}) → {"days":18,"today":"2026-09-27"}
    5. days_since({"date":"2026-09-15"}) → {"days":12,"today":"2026-09-27"}
    5. days_since({"date":"2026-09-02"}) → {"days":25,"today":"2026-09-27"}
    5. days_since({"date":"2026-09-04"}) → {"days":23,"today":"2026-09-27"}
    5. days_since({"date":"2026-09-10"}) → {"days":17,"today":"2026-09-27"}
    5. days_since({"date":"2026-09-12"}) → {"days":15,"today":"2026-09-27"}
    5. days_since({"date":"2026-08-03"}) → {"days":55,"today":"2026-09-27"}
    5. days_since({"date":"2026-09-16"}) → {"days":11,"today":"2026-09-27"}
    5. days_since({"date":"2026-09-11"}) → {"days":16,"today":"2026-09-27"}
    5. days_since({"date":"2026-08-20"}) → {"days":38,"today":"2026-09-27"}
    5. days_since({"date":"2026-09-06"}) → {"days":21,"today":"2026-09-27"}
    5. days_since({"date":"2026-09-24"}) → {"days":3,"today":"2026-09-27"}
    6. submit({"answer":"P-207","work":"Computed refunds for all 16 orders using order details, per-order refund_policy (e.g. P-207 furniture/gold v2: 90%, 45-day window) and) → {"answer":"P-207","work":"Computed refunds for all 16 orders using order details, per-order refund_policy (e.g. P-207 furniture/gold v2: 90%, 45-day window) and
