import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Clarity contract environment
class MockClarityContract {
  constructor() {
    this.bands = new Map()
    this.bandMembers = new Map()
    this.expenses = new Map()
    this.expenseSplits = new Map()
    this.userBands = new Map()
    this.nextBandId = 1
    this.nextExpenseId = 1
    this.timestampCounter = 1
    this.txSender = 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7'
  }

  // Helper methods
  getNextTimestamp() {
    const current = this.timestampCounter
    this.timestampCounter++
    return current
  }

  isBandMember(bandId, member) {
    const key = `${bandId}-${member}`
    return this.bandMembers.has(key)
  }

  getBandMemberCount(bandId) {
    const band = this.bands.get(bandId)
    return band ? band.members.length : 0
  }

  calculateSplitAmount(totalAmount, memberCount) {
    return Math.floor(totalAmount / memberCount)
  }

  // Public functions
  createBand(name, sender = this.txSender) {
    if (!name || name.length === 0) {
      return { error: 'err-invalid-amount' }
    }

    const bandId = this.nextBandId
    const creator = sender

    // Create the band
    this.bands.set(bandId, {
      name,
      creator,
      members: [creator],
      active: true
    })

    // Add creator as first member
    const memberKey = `${bandId}-${creator}`
    this.bandMembers.set(memberKey, {
      nickname: 'Creator',
      joinedAt: this.getNextTimestamp(),
      balance: 0
    })

    // Update user's band list
    const existingBands = this.userBands.get(creator) || []
    this.userBands.set(creator, [...existingBands, bandId])

    this.nextBandId++
    return { ok: bandId }
  }

  joinBand(bandId, nickname, sender = this.txSender) {
    const member = sender
    const bandInfo = this.bands.get(bandId)

    if (!bandInfo) {
      return { error: 'err-not-found' }
    }

    if (!bandInfo.active) {
      return { error: 'err-not-found' }
    }

    if (this.isBandMember(bandId, member)) {
      return { error: 'err-already-exists' }
    }

    if (bandInfo.members.length >= 20) {
      return { error: 'err-invalid-amount' }
    }

    // Add member to band
    const memberKey = `${bandId}-${member}`
    this.bandMembers.set(memberKey, {
      nickname,
      joinedAt: this.getNextTimestamp(),
      balance: 0
    })

    // Update band members list
    bandInfo.members.push(member)
    this.bands.set(bandId, bandInfo)

    // Update user's band list
    const existingBands = this.userBands.get(member) || []
    this.userBands.set(member, [...existingBands, bandId])

    return { ok: true }
  }

  addExpense(bandId, description, amount, category, sender = this.txSender) {
    const expenseId = this.nextExpenseId
    const payer = sender
    const bandInfo = this.bands.get(bandId)

    if (!bandInfo) {
      return { error: 'err-not-found' }
    }

    if (!this.isBandMember(bandId, payer)) {
      return { error: 'err-not-band-member' }
    }

    if (amount <= 0) {
      return { error: 'err-invalid-amount' }
    }

    const memberCount = this.getBandMemberCount(bandId)
    if (memberCount === 0) {
      return { error: 'err-not-found' }
    }

    const splitAmount = this.calculateSplitAmount(amount, memberCount)

    // Create expense record
    this.expenses.set(expenseId, {
      bandId,
      description,
      amount,
      paidBy: payer,
      createdAt: this.getNextTimestamp(),
      settled: false,
      category
    })

    // Create splits for each band member
    bandInfo.members.forEach(member => {
      const splitKey = `${expenseId}-${member}`
      if (member === payer) {
        this.expenseSplits.set(splitKey, {
          amountOwed: 0,
          paid: true
        })
      } else {
        this.expenseSplits.set(splitKey, {
          amountOwed: splitAmount,
          paid: false
        })
      }
    })

    // Update payer's balance
    const payerKey = `${bandId}-${payer}`
    const payerInfo = this.bandMembers.get(payerKey)
    if (payerInfo) {
      payerInfo.balance += (amount - splitAmount)
      this.bandMembers.set(payerKey, payerInfo)
    }

    this.nextExpenseId++
    return { ok: expenseId }
  }

  settleSplit(expenseId, sender = this.txSender) {
    const member = sender
    const expenseInfo = this.expenses.get(expenseId)

    if (!expenseInfo) {
      return { error: 'err-not-found' }
    }

    const splitKey = `${expenseId}-${member}`
    const splitInfo = this.expenseSplits.get(splitKey)

    if (!splitInfo) {
      return { error: 'err-not-found' }
    }

    if (expenseInfo.settled) {
      return { error: 'err-expense-settled' }
    }

    if (splitInfo.paid) {
      return { error: 'err-already-exists' }
    }

    if (!this.isBandMember(expenseInfo.bandId, member)) {
      return { error: 'err-not-band-member' }
    }

    // Mark split as paid
    splitInfo.paid = true
    this.expenseSplits.set(splitKey, splitInfo)

    // Update member's balance
    const memberKey = `${expenseInfo.bandId}-${member}`
    const memberInfo = this.bandMembers.get(memberKey)
    if (memberInfo) {
      memberInfo.balance -= splitInfo.amountOwed
      this.bandMembers.set(memberKey, memberInfo)
    }

    return { ok: true }
  }

  // Read-only functions
  getBand(bandId) {
    return this.bands.get(bandId) || null
  }

  getBandMember(bandId, member) {
    const key = `${bandId}-${member}`
    return this.bandMembers.get(key) || null
  }

  getExpense(expenseId) {
    return this.expenses.get(expenseId) || null
  }

  getExpenseSplit(expenseId, member) {
    const key = `${expenseId}-${member}`
    return this.expenseSplits.get(key) || null
  }

  getUserBands(user) {
    return this.userBands.get(user) || []
  }

  getMemberBalance(bandId, member) {
    const memberInfo = this.getBandMember(bandId, member)
    return memberInfo ? memberInfo.balance : null
  }

  isExpenseSettled(expenseId) {
    const expenseInfo = this.expenses.get(expenseId)
    return expenseInfo ? expenseInfo.settled : false
  }
}

describe('Band Expense Splitting Platform', () => {
  let contract
  const alice = 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7'
  const bob = 'SP2468GC5M6HPKMR7GB8MUBKFBC9FDVHX3HN5BJFG'
  const charlie = 'SP28YKG4N8YGF3RTGGWXMQWMY5G1ESH6AQZJ4XJ6Z'

  beforeEach(() => {
    contract = new MockClarityContract()
    contract.txSender = alice
  })

  describe('Band Creation', () => {
    it('should create a new band successfully', () => {
      const result = contract.createBand('Rock Legends')
      
      expect(result.ok).toBe(1)
      
      const band = contract.getBand(1)
      expect(band.name).toBe('Rock Legends')
      expect(band.creator).toBe(alice)
      expect(band.members).toEqual([alice])
      expect(band.active).toBe(true)
    })

    it('should add creator as first member', () => {
      contract.createBand('Jazz Ensemble')
      
      const member = contract.getBandMember(1, alice)
      expect(member.nickname).toBe('Creator')
      expect(member.balance).toBe(0)
      expect(member.joinedAt).toBe(1)
    })

    it('should update user bands list', () => {
      contract.createBand('Metal Core')
      
      const userBands = contract.getUserBands(alice)
      expect(userBands).toEqual([1])
    })

    it('should reject empty band name', () => {
      const result = contract.createBand('')
      expect(result.error).toBe('err-invalid-amount')
    })

    it('should increment band ID for subsequent bands', () => {
      const result1 = contract.createBand('Band 1')
      const result2 = contract.createBand('Band 2')
      
      expect(result1.ok).toBe(1)
      expect(result2.ok).toBe(2)
    })
  })

  describe('Band Joining', () => {
    beforeEach(() => {
      contract.createBand('Test Band')
    })

    it('should allow new member to join band', () => {
      const result = contract.joinBand(1, 'Guitarist', bob)
      
      expect(result.ok).toBe(true)
      
      const member = contract.getBandMember(1, bob)
      expect(member.nickname).toBe('Guitarist')
      expect(member.balance).toBe(0)
    })

    it('should update band members list', () => {
      contract.joinBand(1, 'Bassist', bob)
      
      const band = contract.getBand(1)
      expect(band.members).toEqual([alice, bob])
    })

    it('should update user bands list', () => {
      contract.joinBand(1, 'Drummer', bob)
      
      const userBands = contract.getUserBands(bob)
      expect(userBands).toEqual([1])
    })

    it('should reject joining non-existent band', () => {
      const result = contract.joinBand(999, 'Vocalist', bob)
      expect(result.error).toBe('err-not-found')
    })

    it('should reject duplicate membership', () => {
      contract.joinBand(1, 'Guitarist', bob)
      const result = contract.joinBand(1, 'Vocalist', bob)
      expect(result.error).toBe('err-already-exists')
    })
  })

  describe('Expense Management', () => {
    beforeEach(() => {
      contract.createBand('Test Band')
      contract.joinBand(1, 'Guitarist', bob)
      contract.joinBand(1, 'Drummer', charlie)
    })

    it('should add expense successfully', () => {
      const result = contract.addExpense(1, 'Studio rental', 300, 'Equipment', alice)
      
      expect(result.ok).toBe(1)
      
      const expense = contract.getExpense(1)
      expect(expense.description).toBe('Studio rental')
      expect(expense.amount).toBe(300)
      expect(expense.paidBy).toBe(alice)
      expect(expense.category).toBe('Equipment')
      expect(expense.settled).toBe(false)
    })

    it('should split expense equally among members', () => {
      contract.addExpense(1, 'Studio rental', 300, 'Equipment', alice)
      
      // 300 / 3 members = 100 each
      const aliceSplit = contract.getExpenseSplit(1, alice)
      const bobSplit = contract.getExpenseSplit(1, bob)
      const charlieSplit = contract.getExpenseSplit(1, charlie)
      
      expect(aliceSplit.amountOwed).toBe(0) // Payer doesn't owe
      expect(aliceSplit.paid).toBe(true)
      
      expect(bobSplit.amountOwed).toBe(100)
      expect(bobSplit.paid).toBe(false)
      
      expect(charlieSplit.amountOwed).toBe(100)
      expect(charlieSplit.paid).toBe(false)
    })

    it('should update payer balance correctly', () => {
      contract.addExpense(1, 'Studio rental', 300, 'Equipment', alice)
      
      // Alice paid 300, owes 100, so balance = 300 - 100 = 200
      const aliceBalance = contract.getMemberBalance(1, alice)
      expect(aliceBalance).toBe(200)
    })

    it('should reject expense from non-member', () => {
      const outsider = 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE'
      const result = contract.addExpense(1, 'Test', 100, 'Test', outsider)
      expect(result.error).toBe('err-not-band-member')
    })

    it('should reject zero amount expense', () => {
      const result = contract.addExpense(1, 'Test', 0, 'Test', alice)
      expect(result.error).toBe('err-invalid-amount')
    })

    it('should reject expense for non-existent band', () => {
      const result = contract.addExpense(999, 'Test', 100, 'Test', alice)
      expect(result.error).toBe('err-not-found')
    })
  })

  describe('Expense Settlement', () => {
    beforeEach(() => {
      contract.createBand('Test Band')
      contract.joinBand(1, 'Guitarist', bob)
      contract.addExpense(1, 'Studio rental', 200, 'Equipment', alice)
    })

    it('should settle split successfully', () => {
      const result = contract.settleSplit(1, bob)
      
      expect(result.ok).toBe(true)
      
      const split = contract.getExpenseSplit(1, bob)
      expect(split.paid).toBe(true)
    })

    it('should update member balance after settlement', () => {
      // Bob owes 100 (200/2), balance starts at 0
      expect(contract.getMemberBalance(1, bob)).toBe(0)
      
      contract.settleSplit(1, bob)
      
      // After settlement, balance should be -100
      expect(contract.getMemberBalance(1, bob)).toBe(-100)
    })

    it('should reject settling non-existent expense', () => {
      const result = contract.settleSplit(999, bob)
      expect(result.error).toBe('err-not-found')
    })

    it('should reject settling already paid split', () => {
      contract.settleSplit(1, bob)
      const result = contract.settleSplit(1, bob)
      expect(result.error).toBe('err-already-exists')
    })

    it('should reject settlement from non-member', () => {
      const outsider = 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE'
      const result = contract.settleSplit(1, outsider)
      expect(result.error).toBe('err-not-found')
    })
  })

  describe('Balance Calculations', () => {
    beforeEach(() => {
      contract.createBand('Test Band')
      contract.joinBand(1, 'Guitarist', bob)
      contract.joinBand(1, 'Drummer', charlie)
    })

    it('should handle multiple expenses correctly', () => {
      // Alice pays 300, split 3 ways = 100 each
      contract.addExpense(1, 'Studio', 300, 'Equipment', alice)
      expect(contract.getMemberBalance(1, alice)).toBe(200) // 300 - 100
      
      // Bob pays 150, split 3 ways = 50 each
      contract.addExpense(1, 'Food', 150, 'Food', bob)
      expect(contract.getMemberBalance(1, bob)).toBe(100) // 150 - 50
      expect(contract.getMemberBalance(1, alice)).toBe(150) // 200 - 50
    })

    it('should show correct balances after partial settlements', () => {
      contract.addExpense(1, 'Studio', 300, 'Equipment', alice)
      
      // Bob settles his part
      contract.settleSplit(1, bob)
      expect(contract.getMemberBalance(1, bob)).toBe(-100)
      expect(contract.getMemberBalance(1, alice)).toBe(200) // Unchanged
      
      // Charlie still hasn't settled
      expect(contract.getMemberBalance(1, charlie)).toBe(0)
    })

    it('should handle complex settlement scenarios', () => {
      // Multiple expenses with different payers and settlements
      contract.addExpense(1, 'Studio', 300, 'Equipment', alice) // 100 each
      contract.addExpense(1, 'Food', 90, 'Food', bob) // 30 each
      contract.addExpense(1, 'Gas', 60, 'Travel', charlie) // 20 each
      
      // Check balances before any settlements
      expect(contract.getMemberBalance(1, alice)).toBe(150) // 300-100-30-20
      expect(contract.getMemberBalance(1, bob)).toBe(40)    // 90-100-30-20
      expect(contract.getMemberBalance(1, charlie)).toBe(10) // 60-100-30-20
      
      // Settle some expenses
      contract.settleSplit(1, bob) // Bob pays his 100 for studio
      contract.settleSplit(2, alice) // Alice pays her 30 for food
      
      expect(contract.getMemberBalance(1, alice)).toBe(120) // 150-30
      expect(contract.getMemberBalance(1, bob)).toBe(-60)   // 40-100
    })
  })

  describe('Read-only Functions', () => {
    beforeEach(() => {
      contract.createBand('Test Band')
      contract.joinBand(1, 'Guitarist', bob)
      contract.addExpense(1, 'Studio', 200, 'Equipment', alice)
    })

    it('should return correct band information', () => {
      const band = contract.getBand(1)
      expect(band.name).toBe('Test Band')
      expect(band.creator).toBe(alice)
      expect(band.members).toEqual([alice, bob])
      expect(band.active).toBe(true)
    })

    it('should return null for non-existent band', () => {
      const band = contract.getBand(999)
      expect(band).toBe(null)
    })

    it('should return correct member information', () => {
      const member = contract.getBandMember(1, bob)
      expect(member.nickname).toBe('Guitarist')
      expect(member.balance).toBe(0)
      expect(typeof member.joinedAt).toBe('number')
    })

    it('should return user bands correctly', () => {
      contract.createBand('Second Band')
      contract.joinBand(2, 'Vocalist', bob)
      
      const aliceBands = contract.getUserBands(alice)
      const bobBands = contract.getUserBands(bob)
      
      expect(aliceBands).toEqual([1, 2])
      expect(bobBands).toEqual([1, 2])
    })

    it('should return empty array for user with no bands', () => {
      const outsiderBands = contract.getUserBands('SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE')
      expect(outsiderBands).toEqual([])
    })

    it('should return correct expense settlement status', () => {
      expect(contract.isExpenseSettled(1)).toBe(false)
      
      // Mark expense as settled (this would be done by contract logic)
      const expense = contract.getExpense(1)
      expense.settled = true
      contract.expenses.set(1, expense)
      
      expect(contract.isExpenseSettled(1)).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle single member band correctly', () => {
      contract.createBand('Solo Act')
      const result = contract.addExpense(1, 'Equipment', 100, 'Gear', alice)
      
      expect(result.ok).toBe(1)
      
      // Single member pays and owes the full amount to themselves
      const aliceBalance = contract.getMemberBalance(1, alice)
      expect(aliceBalance).toBe(0) // 100 paid - 100 owed = 0
    })

    it('should handle large member count', () => {
      contract.createBand('Big Band')
      
      // Add 19 more members (20 total including creator)
      for (let i = 1; i < 20; i++) {
        const member = `SP${i.toString().padStart(39, '0')}`
        contract.joinBand(1, `Member${i}`, member)
      }
      
      const result = contract.addExpense(1, 'Concert Hall', 2000, 'Venue', alice)
      expect(result.ok).toBe(1)
      
      // 2000 / 20 = 100 per person
      const aliceBalance = contract.getMemberBalance(1, alice)
      expect(aliceBalance).toBe(1900) // 2000 - 100
    })

    it('should reject joining when band is at capacity', () => {
      contract.createBand('Full Band')
      
      // Add 19 members to reach capacity
      for (let i = 1; i < 20; i++) {
        const member = `SP${i.toString().padStart(39, '0')}`
        contract.joinBand(1, `Member${i}`, member)
      }
      
      // Try to add 21st member
      const result = contract.joinBand(1, 'Overflow', 'SP999')
      expect(result.error).toBe('err-invalid-amount')
    })
  })
})