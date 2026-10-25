/* =====================================================================
   MINI GAME: TIẾN LÊN MIỀN NAM 13 LÁ (TIEN LEN 13 CARDS)
   ===================================================================== */

const TienLen = {
  // Sprite config cho 52 lá bài (assets/cards.jpg: 1024x469)
  // 4 Hàng (Chất): 0=Rô (Diamond), 1=Chuồn/Tép (Club), 2=Cơ (Heart), 3=Bích (Spade)
  // 13 Cột: 0=A, 1=2, 2=3, 3=4, ..., 9=10, 10=J, 11=Q, 12=K
  ROW_Y: [21, 132, 244, 355],
  COL_X: [20, 97, 173, 249, 326, 402, 478, 555, 631, 707, 784, 860, 936],
  CARD_W: 67,
  CARD_H: 93,

  // Trạng thái bàn chơi
  active: false,
  betAmount: 50000,
  players: [
    { id: 0, name: 'Bạn', isHuman: true, hand: [], passed: false, rank: 0 },
    { id: 1, name: 'Bắc Kiếm', isHuman: false, hand: [], passed: false, rank: 0 },
    { id: 2, name: 'Tây Độc', isHuman: false, hand: [], passed: false, rank: 0 },
    { id: 3, name: 'Nam Thần', isHuman: false, hand: [], passed: false, rank: 0 }
  ],
  currentTurn: 0,
  lastPlay: null,      // { playerId: 0, cards: [...], type: 'single', val: 5 }
  selectedIndices: [],
  roundPassCount: 0,
  isProcessing: false,

  // Thứ tự tiến lên miền nam:
  // Giá trị quân (Rank): 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2
  // Điểm rank quy ước: 3 -> 3, ..., 10 -> 10, J -> 11, Q -> 12, K -> 13, A -> 14, 2 -> 15
  // Chất (Suit): Bích (0) < Chuồn (1) < Rô (2) < Cơ (3)
  // Tổng điểm lá = rank * 4 + suit (từ thấp nhất 3 Bích = 12 đến cao nhất 2 Cơ = 63)
  SUIT_WEIGHTS: { 3: 0, 1: 1, 0: 2, 2: 3 }, // hàng 3(Spade)=0, hàng 1(Club)=1, hàng 0(Diamond)=2, hàng 2(Heart)=3
  RANK_ORDER: [14, 15, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], // 0(A)=14, 1(2)=15, 2(3)=3 ...

  initDeck() {
    const deck = [];
    for (let r = 0; r < 13; r++) {      // col: A..K
      for (let s = 0; s < 4; s++) {    // row: Diamond, Club, Heart, Spade
        const rankVal = this.RANK_ORDER[r];
        const suitVal = this.SUIT_WEIGHTS[s];
        const weight = rankVal * 4 + suitVal;
        deck.push({
          col: r, row: s,
          rank: rankVal,
          suit: suitVal,
          weight: weight,
          name: this.getCardName(rankVal, suitVal)
        });
      }
    }
    return deck;
  },

  getCardName(rank, suit) {
    const rNames = { 3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2' };
    const sNames = ['♠','♣','♦','♥'];
    return rNames[rank] + sNames[suit];
  },

  shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  },

  startNewGame() {
    if (state.balance < this.betAmount) {
      toast('Số dư không đủ ' + fmtComma(this.betAmount) + ' để vào bàn Tiến Lên!');
      return;
    }
    // Trừ cược người chơi
    addReward(-this.betAmount);
    toast('Đã cược bàn: ' + fmtComma(this.betAmount) + 'đ');

    this.active = true;
    this.selectedIndices = [];
    this.lastPlay = null;
    this.roundPassCount = 0;
    this.isProcessing = false;

    // Chia bài
    const deck = this.shuffle(this.initDeck());
    this.players.forEach((p, idx) => {
      p.hand = deck.slice(idx * 13, (idx + 1) * 13);
      this.sortHand(p.hand);
      p.passed = false;
      p.rank = 0;
    });

    // Ai có 3 Bích (weight thấp nhất: rank 3 suit 0 => weight 12) đánh trước ván đầu
    let firstTurn = 0;
    for (let i = 0; i < 4; i++) {
      if (this.players[i].hand.some(c => c.rank === 3 && c.suit === 0)) {
        firstTurn = i;
        break;
      }
    }
    this.currentTurn = firstTurn;

    this.render();
    Sound.playCard();

    // Mở màn hình Tiến Lên
    $('tienlenScreen').classList.add('open');

    if (this.currentTurn !== 0) {
      setTimeout(() => this.processBotTurn(), 900);
    }
  },

  sortHand(hand) {
    hand.sort((a, b) => a.weight - b.weight);
  },

  createCardElement(card, isSelected = false, isPlayed = false) {
    const el = document.createElement('div');
    el.className = 'card-item' + (isSelected ? ' selected' : '') + (isPlayed ? ' played' : '');
    const posX = this.COL_X[card.col];
    const posY = this.ROW_Y[card.row];
    el.style.backgroundPosition = `-${posX}px -${posY}px`;
    return el;
  },

  render() {
    // 1. Cập nhật thông tin Người chơi & Bots
    $('tlMyBal').textContent = fmtComma(state.balance);
    $('tlBot1Count').textContent = this.players[1].hand.length + ' lá';
    $('tlBot2Count').textContent = this.players[2].hand.length + ' lá';
    $('tlBot3Count').textContent = this.players[3].hand.length + ' lá';

    $('tlPlayer0').classList.toggle('turn', this.currentTurn === 0);
    $('tlPlayer1').classList.toggle('turn', this.currentTurn === 1);
    $('tlPlayer2').classList.toggle('turn', this.currentTurn === 2);
    $('tlPlayer3').classList.toggle('turn', this.currentTurn === 3);

    // 2. Render bài người chơi (Hand)
    const handBox = $('tlMyHand');
    handBox.innerHTML = '';
    const myHand = this.players[0].hand;
    myHand.forEach((card, idx) => {
      const isSel = this.selectedIndices.includes(idx);
      const cardEl = this.createCardElement(card, isSel, false);
      cardEl.style.zIndex = idx + 1;
      cardEl.onclick = () => this.toggleSelectCard(idx);
      handBox.appendChild(cardEl);
    });

    // 3. Render bài trên bàn
    const centerBox = $('tlPlayedCards');
    centerBox.innerHTML = '';
    if (this.lastPlay && this.lastPlay.cards) {
      this.lastPlay.cards.forEach((c, i) => {
        const cEl = this.createCardElement(c, false, true);
        cEl.style.zIndex = i + 1;
        centerBox.appendChild(cEl);
      });
      const who = this.players[this.lastPlay.playerId].name;
      $('tlLastAction').textContent = `${who} vừa đánh: ${this.lastPlay.typeDesc}`;
    } else {
      $('tlLastAction').textContent = 'Vòng đánh mới — Đánh bài tự do!';
    }

    // 4. Trạng thái nút hành động
    const btnPlay = $('tlBtnPlay');
    const btnPass = $('tlBtnPass');
    if (this.currentTurn === 0 && !this.isProcessing) {
      btnPlay.disabled = this.selectedIndices.length === 0;
      btnPass.disabled = !this.lastPlay; // Vòng mới bắt buộc phải đánh, không được bỏ lượt
    } else {
      btnPlay.disabled = true;
      btnPass.disabled = true;
    }
  },

  toggleSelectCard(idx) {
    if (this.currentTurn !== 0 || this.isProcessing) return;
    const found = this.selectedIndices.indexOf(idx);
    if (found >= 0) {
      this.selectedIndices.splice(found, 1);
    } else {
      this.selectedIndices.push(idx);
    }
    Sound.click();
    this.render();
  },

  sortMyHand() {
    this.sortHand(this.players[0].hand);
    this.selectedIndices = [];
    Sound.chip();
    this.render();
  },

  // Đánh giá bộ bài: rác, đôi, ba, sảnh, tứ quý, 3 đôi thông...
  evaluateCards(cards) {
    if (!cards || cards.length === 0) return null;
    const n = cards.length;
    const sorted = [...cards].sort((a, b) => a.weight - b.weight);
    const highest = sorted[n - 1];

    // 1 lá: Rác
    if (n === 1) {
      return { type: 'single', highWeight: highest.weight, rank: highest.rank, len: 1, typeDesc: 'Rác ' + highest.name };
    }

    // 2 lá: Đôi
    if (n === 2) {
      if (sorted[0].rank === sorted[1].rank) {
        return { type: 'pair', highWeight: highest.weight, rank: highest.rank, len: 2, typeDesc: 'Đôi ' + highest.name };
      }
      return null;
    }

    // 3 lá: Ba lá (Sám cô)
    if (n === 3) {
      if (sorted[0].rank === sorted[1].rank && sorted[1].rank === sorted[2].rank) {
        return { type: 'triple', highWeight: highest.weight, rank: highest.rank, len: 3, typeDesc: 'Sám cô ' + highest.rank };
      }
    }

    // 4 lá: Tứ quý
    if (n === 4) {
      if (sorted[0].rank === sorted[1].rank && sorted[1].rank === sorted[2].rank && sorted[2].rank === sorted[3].rank) {
        return { type: 'four', highWeight: highest.weight, rank: highest.rank, len: 4, typeDesc: '🔥 Tứ quý ' + highest.rank };
      }
    }

    // Sảnh (từ 3 lá trở lên liên tiếp, không chứa lá 2)
    if (n >= 3) {
      let isStraight = true;
      for (let i = 0; i < n - 1; i++) {
        if (sorted[i].rank === 15 || sorted[i + 1].rank === 15) { isStraight = false; break; } // Không chứa Heo
        if (sorted[i + 1].rank !== sorted[i].rank + 1) { isStraight = false; break; }
      }
      if (isStraight) {
        return { type: 'straight', highWeight: highest.weight, rank: highest.rank, len: n, typeDesc: `Sảnh ${n} lá (đến ${highest.name})` };
      }
    }

    return null;
  },

  // Kiểm tra bài đánh ra có đè được bài trước đó không
  canBeat(evalNew, evalOld) {
    if (!evalOld) return true; // Bàn trống, đánh gì cũng được

    // Chặt Heo bằng Tứ Quý:
    if (evalNew.type === 'four' && evalOld.type === 'single' && evalOld.rank === 15) {
      return true;
    }
    // Tứ quý đè Tứ quý:
    if (evalNew.type === 'four' && evalOld.type === 'four') {
      return evalNew.highWeight > evalOld.highWeight;
    }

    // Cùng loại bộ:
    if (evalNew.type === evalOld.type && evalNew.len === evalOld.len) {
      return evalNew.highWeight > evalOld.highWeight;
    }

    return false;
  },

  // Người chơi bấm "ĐÁNH BÀI"
  playSelected() {
    if (this.currentTurn !== 0 || this.isProcessing) return;
    if (this.selectedIndices.length === 0) return;

    const myHand = this.players[0].hand;
    const cardsToPlay = this.selectedIndices.map(i => myHand[i]);
    const evaluated = this.evaluateCards(cardsToPlay);

    if (!evaluated) {
      toast('Bài chọn không hợp lệ (không phải rác, đôi, sám, tứ quý hoặc sảnh)!');
      return;
    }

    if (this.lastPlay && !this.canBeat(evaluated, this.lastPlay.eval)) {
      toast('Bài của bạn không đè được bài trên bàn!');
      return;
    }

    // Đánh bài thành công
    this.executePlay(0, cardsToPlay, evaluated);
  },

  // Bỏ lượt (PASS)
  passTurn() {
    if (this.currentTurn !== 0 || this.isProcessing) return;
    if (!this.lastPlay) {
      toast('Đang mở vòng mới, bạn phải đánh bài!');
      return;
    }
    Sound.passTurn();
    this.players[0].passed = true;
    toast('Bạn đã bỏ lượt!');
    this.nextTurn();
  },

  executePlay(playerId, cards, evaluated) {
    Sound.playCard();
    const player = this.players[playerId];

    // Loại bỏ bài khỏi tay
    player.hand = player.hand.filter(c => !cards.some(sc => sc.weight === c.weight));

    this.lastPlay = {
      playerId,
      cards,
      eval: evaluated,
      typeDesc: evaluated.typeDesc
    };
    this.selectedIndices = [];
    this.roundPassCount = 0; // Reset pass count vì có người đánh mới

    // Kiểm tra hết bài -> Thắng
    if (player.hand.length === 0) {
      this.finishGame(playerId);
      return;
    }

    this.nextTurn();
  },

  nextTurn() {
    let next = (this.currentTurn + 1) % 4;

    // Đếm số người đã pass trong vòng
    let activePlayers = this.players.filter(p => p.hand.length > 0 && !p.passed);

    // Nếu chỉ còn 1 người chưa pass (3 người kia đã pass) -> Bắt đầu vòng mới
    if (activePlayers.length <= 1) {
      const winnerOfRound = activePlayers[0] ? activePlayers[0].id : next;
      this.players.forEach(p => p.passed = false);
      this.lastPlay = null;
      this.currentTurn = winnerOfRound;
      toast(`Vòng đánh mới thuộc về ${this.players[winnerOfRound].name}!`);
      this.render();
      if (this.currentTurn !== 0) {
        setTimeout(() => this.processBotTurn(), 800);
      }
      return;
    }

    // Tìm người tiếp theo chưa bỏ lượt
    while (this.players[next].passed || this.players[next].hand.length === 0) {
      next = (next + 1) % 4;
    }

    this.currentTurn = next;
    this.render();

    if (this.currentTurn !== 0) {
      setTimeout(() => this.processBotTurn(), 900);
    }
  },

  // AI ĐỐI THỦ TỰ ĐỘNG (BOT LOGIC)
  processBotTurn() {
    if (!this.active) return;
    const bot = this.players[this.currentTurn];
    if (bot.isHuman || bot.passed) return;

    this.isProcessing = true;
    const hand = bot.hand;
    const last = this.lastPlay ? this.lastPlay.eval : null;

    let candidate = null;

    if (!last) {
      // Vòng mới: Bot đánh rác nhỏ nhất hoặc đôi nhỏ nhất
      candidate = [hand[0]];
    } else {
      // Tìm bài hợp lệ đè được lastPlay
      if (last.type === 'single') {
        // Tìm 1 lá đè được
        for (let i = 0; i < hand.length; i++) {
          const evalC = this.evaluateCards([hand[i]]);
          if (this.canBeat(evalC, last)) {
            // Nếu last là heo mà có tứ quý thì chặt heo!
            candidate = [hand[i]];
            break;
          }
        }
      } else if (last.type === 'pair') {
        // Tìm đôi đè được
        for (let i = 0; i < hand.length - 1; i++) {
          if (hand[i].rank === hand[i+1].rank) {
            const evalP = this.evaluateCards([hand[i], hand[i+1]]);
            if (this.canBeat(evalP, last)) {
              candidate = [hand[i], hand[i+1]];
              break;
            }
          }
        }
      } else if (last.type === 'triple') {
        for (let i = 0; i < hand.length - 2; i++) {
          if (hand[i].rank === hand[i+1].rank && hand[i+1].rank === hand[i+2].rank) {
            const evalT = this.evaluateCards([hand[i], hand[i+1], hand[i+2]]);
            if (this.canBeat(evalT, last)) {
              candidate = [hand[i], hand[i+1], hand[i+2]];
              break;
            }
          }
        }
      } else if (last.type === 'straight') {
        // Tìm sảnh cùng độ dài
        const len = last.len;
        for (let i = 0; i <= hand.length - len; i++) {
          const sub = hand.slice(i, i + len);
          const evalS = this.evaluateCards(sub);
          if (evalS && evalS.type === 'straight' && this.canBeat(evalS, last)) {
            candidate = sub;
            break;
          }
        }
      }
    }

    if (candidate) {
      const evalCand = this.evaluateCards(candidate);
      this.isProcessing = false;
      this.executePlay(bot.id, candidate, evalCand);
    } else {
      // Không có bài đè -> Bỏ lượt
      bot.passed = true;
      Sound.passTurn();
      toast(`${bot.name} bỏ lượt`);
      this.isProcessing = false;
      this.nextTurn();
    }
  },

  // Kết thúc ván bài
  finishGame(winnerId) {
    this.active = false;
    const isPlayerWin = winnerId === 0;
    const winnerName = this.players[winnerId].name;

    const modal = $('tlEndModal');
    const title = $('tlEndTitle');
    const desc = $('tlEndDesc');

    if (isPlayerWin) {
      Sound.win();
      const prize = this.betAmount * 3.8; // Thưởng ăn cả 3 nhà
      addReward(prize);
      title.className = 'tl-end-title win';
      title.textContent = '🎉 CHIẾN THẮNG!';
      desc.innerHTML = `Chúc mừng bạn đã về nhất!<br>Tiền thưởng nhận được: <b>+${fmtComma(prize)}đ</b>`;
    } else {
      Sound.lose();
      title.className = 'tl-end-title lose';
      title.textContent = '💀 THUA CUỘC!';
      desc.innerHTML = `Người chơi <b>${winnerName}</b> đã về nhất trước.<br>Chúc bạn may mắn ở ván sau!`;
    }

    modal.classList.add('open');
  },

  closeGame() {
    $('tlEndModal').classList.remove('open');
    $('tienlenScreen').classList.remove('open');
    openHome();
  }
};
