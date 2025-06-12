;; Band Expense Splitting Platform
;; A smart contract for managing shared expenses among band members

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-unauthorized (err u102))
(define-constant err-already-exists (err u103))
(define-constant err-insufficient-balance (err u104))
(define-constant err-invalid-amount (err u105))
(define-constant err-not-band-member (err u106))
(define-constant err-expense-settled (err u107))

;; Data Variables
(define-data-var next-band-id uint u1)
(define-data-var next-expense-id uint u1)
(define-data-var timestamp-counter uint u1)

;; Data Maps
(define-map bands
  uint
  {
    name: (string-ascii 50),
    creator: principal,
    members: (list 20 principal),
    active: bool
  }
)

(define-map band-members
  {band-id: uint, member: principal}
  {
    nickname: (string-ascii 30),
    joined-at: uint,
    balance: int ;; Can be negative (owes money) or positive (owed money)
  }
)

(define-map expenses
  uint
  {
    band-id: uint,
    description: (string-ascii 100),
    amount: uint,
    paid-by: principal,
    created-at: uint,
    settled: bool,
    category: (string-ascii 30)
  }
)

(define-map expense-splits
  {expense-id: uint, member: principal}
  {
    amount-owed: uint,
    paid: bool
  }
)

(define-map user-bands
  principal
  (list 10 uint)
)

;; Helper Functions
(define-private (get-next-timestamp)
  (let ((current-timestamp (var-get timestamp-counter)))
    (var-set timestamp-counter (+ current-timestamp u1))
    current-timestamp
  )
)

(define-private (is-band-member (band-id uint) (member principal))
  (is-some (map-get? band-members {band-id: band-id, member: member}))
)

(define-private (get-band-member-count (band-id uint))
  (match (map-get? bands band-id)
    band (len (get members band))
    u0
  )
)

(define-private (calculate-split-amount (total-amount uint) (member-count uint))
  (/ total-amount member-count)
)

;; Public Functions

;; Create a new band
(define-public (create-band (name (string-ascii 50)))
  (let (
    (band-id (var-get next-band-id))
    (creator tx-sender)
  )
    (asserts! (> (len name) u0) err-invalid-amount)
    
    ;; Create the band
    (map-set bands band-id {
      name: name,
      creator: creator,
      members: (list creator),
      active: true
    })
    
    ;; Add creator as first member
    (map-set band-members 
      {band-id: band-id, member: creator}
      {
        nickname: "Creator",
        joined-at: (get-next-timestamp),
        balance: 0
      }
    )
    
    ;; Update user's band list
    (match (map-get? user-bands creator)
      existing-bands (map-set user-bands creator (unwrap-panic (as-max-len? (append existing-bands band-id) u10)))
      (map-set user-bands creator (list band-id))
    )
    
    ;; Increment band ID counter
    (var-set next-band-id (+ band-id u1))
    
    (ok band-id)
  )
)

;; Join an existing band
(define-public (join-band (band-id uint) (nickname (string-ascii 30)))
  (let (
    (member tx-sender)
    (band-info (unwrap! (map-get? bands band-id) err-not-found))
  )
    (asserts! (get active band-info) err-not-found)
    (asserts! (not (is-band-member band-id member)) err-already-exists)
    (asserts! (< (len (get members band-info)) u20) err-invalid-amount)
    
    ;; Add member to band
    (map-set band-members 
      {band-id: band-id, member: member}
      {
        nickname: nickname,
        joined-at: (get-next-timestamp),
        balance: 0
      }
    )
    
    ;; Update band members list
    (map-set bands band-id 
      (merge band-info {
        members: (unwrap-panic (as-max-len? (append (get members band-info) member) u20))
      })
    )
    
    ;; Update user's band list
    (match (map-get? user-bands member)
      existing-bands (map-set user-bands member (unwrap-panic (as-max-len? (append existing-bands band-id) u10)))
      (map-set user-bands member (list band-id))
    )
    
    (ok true)
  )
)

;; Add an expense
(define-public (add-expense 
  (band-id uint) 
  (description (string-ascii 100)) 
  (amount uint) 
  (category (string-ascii 30))
)
  (let (
    (expense-id (var-get next-expense-id))
    (payer tx-sender)
    (band-info (unwrap! (map-get? bands band-id) err-not-found))
    (member-count (get-band-member-count band-id))
    (split-amount (calculate-split-amount amount member-count))
  )
    (asserts! (is-band-member band-id payer) err-not-band-member)
    (asserts! (> amount u0) err-invalid-amount)
    (asserts! (> member-count u0) err-not-found)
    
    ;; Create expense record
    (map-set expenses expense-id {
      band-id: band-id,
      description: description,
      amount: amount,
      paid-by: payer,
      created-at: (get-next-timestamp),
      settled: false,
      category: category
    })
    
    ;; Create splits for each band member
    (map create-expense-split 
      (get members band-info)
      (list {expense-id: expense-id, amount: split-amount, payer: payer})
    )
    
    ;; Update payer's balance (they paid the full amount)
    (match (map-get? band-members {band-id: band-id, member: payer})
      member-info (map-set band-members 
        {band-id: band-id, member: payer}
        (merge member-info {
          balance: (+ (get balance member-info) (to-int (- amount split-amount)))
        })
      )
      false
    )
    
    ;; Increment expense ID
    (var-set next-expense-id (+ expense-id u1))
    
    (ok expense-id)
  )
)

;; Helper function to create expense splits
(define-private (create-expense-split (member principal) (split-data {expense-id: uint, amount: uint, payer: principal}))
  (let (
    (expense-id (get expense-id split-data))
    (amount (get amount split-data))
    (payer (get payer split-data))
  )
    (if (is-eq member payer)
      ;; Payer doesn't owe themselves
      (map-set expense-splits {expense-id: expense-id, member: member} {
        amount-owed: u0,
        paid: true
      })
      ;; Other members owe their split
      (map-set expense-splits {expense-id: expense-id, member: member} {
        amount-owed: amount,
        paid: false
      })
    )
  )
)

;; Settle an expense split
(define-public (settle-split (expense-id uint))
  (let (
    (member tx-sender)
    (expense-info (unwrap! (map-get? expenses expense-id) err-not-found))
    (split-info (unwrap! (map-get? expense-splits {expense-id: expense-id, member: member}) err-not-found))
    (band-id (get band-id expense-info))
  )
    (asserts! (not (get settled expense-info)) err-expense-settled)
    (asserts! (not (get paid split-info)) err-already-exists)
    (asserts! (is-band-member band-id member) err-not-band-member)
    
    ;; Mark split as paid
    (map-set expense-splits {expense-id: expense-id, member: member}
      (merge split-info {paid: true})
    )
    
    ;; Update member's balance
    (match (map-get? band-members {band-id: band-id, member: member})
      member-info (map-set band-members 
        {band-id: band-id, member: member}
        (merge member-info {
          balance: (- (get balance member-info) (to-int (get amount-owed split-info)))
        })
      )
      false
    )
    
    (ok true)
  )
)

;; Read-only functions

;; Get band information
(define-read-only (get-band (band-id uint))
  (map-get? bands band-id)
)

;; Get member information
(define-read-only (get-band-member (band-id uint) (member principal))
  (map-get? band-members {band-id: band-id, member: member})
)

;; Get expense information
(define-read-only (get-expense (expense-id uint))
  (map-get? expenses expense-id)
)

;; Get expense split information
(define-read-only (get-expense-split (expense-id uint) (member principal))
  (map-get? expense-splits {expense-id: expense-id, member: member})
)

;; Get user's bands
(define-read-only (get-user-bands (user principal))
  (default-to (list) (map-get? user-bands user))
)

;; Get member's balance in a band
(define-read-only (get-member-balance (band-id uint) (member principal))
  (match (map-get? band-members {band-id: band-id, member: member})
    member-info (some (get balance member-info))
    none
  )
)

;; Check if expense is fully settled
(define-read-only (is-expense-settled (expense-id uint))
  (match (map-get? expenses expense-id)
    expense-info (get settled expense-info)
    false
  )
)