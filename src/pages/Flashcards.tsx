import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Plus,
  ArrowLeft,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  BookOpen,
  Loader2,
  Languages,
  FolderPlus,
  Layers,
  Check,
  X,
  RotateCcw,
  Brain,
  Zap,
  Target
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

interface Flashcard {
  id: string;
  word: string;
  meaning: string;
  translation?: string | null;
  example?: string | null;
  deck_id: string;
  status: 'learning' | 'reviewing' | 'mastered';
  review_count: number;
  correct_count: number;
}

interface Deck {
  id: string;
  name: string;
  description?: string | null;
  card_count: number;
  created_at: string;
  // Progress stats
  learning_count: number;
  reviewing_count: number;
  mastered_count: number;
}

interface DeckStats {
  learning: number;
  reviewing: number;
  mastered: number;
  total: number;
}

type PracticeMode = 'progressive' | 'static';

export default function Flashcards() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentDeck, setCurrentDeck] = useState<Deck | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddDeck, setShowAddDeck] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDescription, setNewDeckDescription] = useState('');
  const [newCard, setNewCard] = useState({ word: '', meaning: '', example: '' });
  const [translating, setTranslating] = useState(false);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('progressive');
  const [deckStats, setDeckStats] = useState<DeckStats>({ learning: 0, reviewing: 0, mastered: 0, total: 0 });
  const [practiceCards, setPracticeCards] = useState<Flashcard[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [, setIsReviewingAll] = useState(false);
  
  // Track if initial load has been done to prevent reload on tab switch
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      navigate('/auth');
      return;
    }
    
    // Only load decks on initial mount, not on every auth state change
    if (!hasInitiallyLoaded) {
      loadDecks();
      setHasInitiallyLoaded(true);
    }
  }, [user, authLoading, navigate, hasInitiallyLoaded]);

  const loadDecks = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('flashcard_decks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get card counts and status breakdowns for each deck
      const decksWithCounts = await Promise.all((data || []).map(async (deck) => {
        const { data: cards } = await supabase
          .from('flashcard_cards')
          .select('status')
          .eq('deck_id', deck.id);
        
        const cardsList = cards || [];
        const learning_count = cardsList.filter(c => c.status === 'learning').length;
        const reviewing_count = cardsList.filter(c => c.status === 'reviewing').length;
        const mastered_count = cardsList.filter(c => c.status === 'mastered').length;
        
        return { 
          ...deck, 
          card_count: cardsList.length,
          learning_count,
          reviewing_count,
          mastered_count,
        };
      }));

      setDecks(decksWithCounts);
    } catch (error) {
      console.error('Error loading decks:', error);
      toast({ title: 'Failed to load decks', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadCards = async (deckId: string) => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('flashcard_cards')
        .select('*')
        .eq('deck_id', deckId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const loadedCards = (data || []).map(c => ({
        ...c,
        status: c.status as 'learning' | 'reviewing' | 'mastered'
      }));
      
      setCards(loadedCards);
      updateDeckStats(loadedCards);
      
      // Prepare practice cards based on mode
      preparePracticeCards(loadedCards);
    } catch (error) {
      console.error('Error loading cards:', error);
      setCards([]);
    }
  };

  const updateDeckStats = (cardList: Flashcard[]) => {
    const stats = {
      learning: cardList.filter(c => c.status === 'learning').length,
      reviewing: cardList.filter(c => c.status === 'reviewing').length,
      mastered: cardList.filter(c => c.status === 'mastered').length,
      total: cardList.length
    };
    setDeckStats(stats);
  };

  const preparePracticeCards = (cardList: Flashcard[], includeAll: boolean = false) => {
    setIsReviewingAll(includeAll);
    
    if (practiceMode === 'progressive' && !includeAll) {
      // Progressive mode: prioritize cards user doesn't know well
      // Cards with lower correct_count and higher review_count should appear more often
      const learningCards = cardList.filter(c => c.status === 'learning');
      const reviewingCards = cardList.filter(c => c.status === 'reviewing');
      
      // Weight cards by their difficulty (lower correct ratio = higher priority)
      const weightedSort = (cards: Flashcard[]) => {
        return cards.sort((a, b) => {
          const ratioA = a.review_count > 0 ? a.correct_count / a.review_count : 0;
          const ratioB = b.review_count > 0 ? b.correct_count / b.review_count : 0;
          // Lower ratio (more difficult) comes first
          return ratioA - ratioB;
        });
      };
      
      // Sort learning cards by difficulty (harder ones first)
      const sortedLearning = weightedSort([...learningCards]);
      // Sort reviewing cards by difficulty
      const sortedReviewing = weightedSort([...reviewingCards]);
      
      // Add some randomization while maintaining priority
      const shuffleWithPriority = (cards: Flashcard[]) => {
        // Take chunks and shuffle within each chunk
        const chunkSize = Math.max(3, Math.floor(cards.length / 3));
        const result: Flashcard[] = [];
        for (let i = 0; i < cards.length; i += chunkSize) {
          const chunk = cards.slice(i, i + chunkSize);
          result.push(...chunk.sort(() => Math.random() - 0.5));
        }
        return result;
      };
      
      const combinedCards = [
        ...shuffleWithPriority(sortedLearning),
        ...shuffleWithPriority(sortedReviewing)
      ];
      
      setPracticeCards(combinedCards);
    } else {
      // Static mode OR includeAll (Review All): all cards shuffled including mastered
      setPracticeCards([...cardList].sort(() => Math.random() - 0.5));
    }
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setSessionComplete(false);
  };

  const createDeck = async () => {
    if (!newDeckName.trim() || !user) return;
    
    try {
      const { data, error } = await supabase
        .from('flashcard_decks')
        .insert({
          user_id: user.id,
          name: newDeckName.trim(),
          description: newDeckDescription.trim() || null
        })
        .select()
        .single();

      if (error) throw error;

      setDecks([{ ...data, card_count: 0, learning_count: 0, reviewing_count: 0, mastered_count: 0 }, ...decks]);
      setNewDeckName('');
      setNewDeckDescription('');
      setShowAddDeck(false);
      toast({ title: 'Deck created', description: `"${data.name}" is ready` });
    } catch (error) {
      console.error('Error creating deck:', error);
      toast({ title: 'Failed to create deck', variant: 'destructive' });
    }
  };

  const deleteDeck = async (deckId: string) => {
    try {
      const { error } = await supabase
        .from('flashcard_decks')
        .delete()
        .eq('id', deckId);

      if (error) throw error;

      setDecks(decks.filter(d => d.id !== deckId));
      
      if (currentDeck?.id === deckId) {
        setCurrentDeck(null);
        setCards([]);
      }
      
      toast({ title: 'Deck deleted' });
    } catch (error) {
      console.error('Error deleting deck:', error);
      toast({ title: 'Failed to delete deck', variant: 'destructive' });
    }
  };

  const selectDeck = (deck: Deck) => {
    setCurrentDeck(deck);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setSessionComplete(false);
    loadCards(deck.id);
  };

  const translateWord = async (word: string): Promise<string> => {
    setTranslating(true);
    try {
      const response = await supabase.functions.invoke('translate-word', {
        body: { word, targetLanguage: 'bn' }
      });

      if (response.error) throw response.error;
      return response.data.translation || '';
    } catch (error) {
      console.error('Translation error:', error);
      return '';
    } finally {
      setTranslating(false);
    }
  };

  const addCard = async () => {
    if (!newCard.word.trim() || !currentDeck || !user) return;
    
    let meaning = newCard.meaning.trim();
    if (!meaning) {
      meaning = await translateWord(newCard.word);
      if (!meaning) {
        toast({ title: 'Could not auto-translate', description: 'Please enter the meaning manually', variant: 'destructive' });
        return;
      }
    }
    
    try {
      const { data, error } = await supabase
        .from('flashcard_cards')
        .insert({
          deck_id: currentDeck.id,
          user_id: user.id,
          word: newCard.word.trim(),
          meaning,
          example: newCard.example.trim() || null,
          status: 'learning'
        })
        .select()
        .single();

      if (error) throw error;

      const newFlashcard: Flashcard = { 
        ...data, 
        status: data.status as 'learning' | 'reviewing' | 'mastered' 
      };
      const updatedCards = [...cards, newFlashcard];
      setCards(updatedCards);
      updateDeckStats(updatedCards);
      preparePracticeCards(updatedCards);
      
      // Update deck card count
      setDecks(decks.map(d => 
        d.id === currentDeck.id ? { ...d, card_count: d.card_count + 1 } : d
      ));

      setNewCard({ word: '', meaning: '', example: '' });
      setShowAddCard(false);
      toast({ title: 'Card added' });
    } catch (error) {
      console.error('Error adding card:', error);
      toast({ title: 'Failed to add card', variant: 'destructive' });
    }
  };

  const deleteCard = async (cardId: string) => {
    if (!currentDeck) return;
    
    try {
      const { error } = await supabase
        .from('flashcard_cards')
        .delete()
        .eq('id', cardId);

      if (error) throw error;

      const updatedCards = cards.filter(c => c.id !== cardId);
      setCards(updatedCards);
      updateDeckStats(updatedCards);
      preparePracticeCards(updatedCards);
      
      // Update deck card count
      setDecks(decks.map(d => 
        d.id === currentDeck.id ? { ...d, card_count: Math.max(0, d.card_count - 1) } : d
      ));

      if (currentCardIndex >= updatedCards.length) {
        setCurrentCardIndex(Math.max(0, updatedCards.length - 1));
      }

      toast({ title: 'Card deleted' });
    } catch (error) {
      console.error('Error deleting card:', error);
      toast({ title: 'Failed to delete card', variant: 'destructive' });
    }
  };

  const handleCardResponse = async (knewIt: boolean) => {
    // Allow response handling in progressive mode OR when reviewing all cards
    if (practiceMode !== 'progressive' || practiceCards.length === 0) return;
    
    const currentCard = practiceCards[currentCardIndex];
    if (!currentCard) return;

    // Update card status based on response
    let newStatus: 'learning' | 'reviewing' | 'mastered' = currentCard.status;
    const newReviewCount = currentCard.review_count + 1;
    const newCorrectCount = knewIt ? currentCard.correct_count + 1 : currentCard.correct_count;

    if (knewIt) {
      if (currentCard.status === 'learning') {
        newStatus = 'reviewing';
      } else if (currentCard.status === 'reviewing' && newCorrectCount >= 3) {
        newStatus = 'mastered';
      }
    } else {
      // If wrong, move back to learning
      if (currentCard.status === 'mastered' || currentCard.status === 'reviewing') {
        newStatus = 'learning';
      }
    }

    try {
      const { error } = await supabase
        .from('flashcard_cards')
        .update({
          status: newStatus,
          review_count: newReviewCount,
          correct_count: newCorrectCount
        })
        .eq('id', currentCard.id);

      if (error) throw error;

      // Update local state
      const updatedCards = cards.map(c => 
        c.id === currentCard.id 
          ? { ...c, status: newStatus, review_count: newReviewCount, correct_count: newCorrectCount }
          : c
      );
      setCards(updatedCards);
      updateDeckStats(updatedCards);

      // Move to next card
      if (currentCardIndex < practiceCards.length - 1) {
        setCurrentCardIndex(currentCardIndex + 1);
        setIsFlipped(false);
      } else {
        setSessionComplete(true);
      }
    } catch (error) {
      console.error('Error updating card:', error);
    }
  };

  const shuffleCards = () => {
    preparePracticeCards(cards);
  };

  const nextCard = () => {
    if (currentCardIndex < practiceCards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setIsFlipped(false);
    }
  };

  const prevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setIsFlipped(false);
    }
  };

  const restartSession = (includeAll: boolean = false) => {
    preparePracticeCards(cards, includeAll);
  };

  const resetDeckProgress = async () => {
    if (!currentDeck || !user) return;
    
    if (!confirm('Are you sure you want to reset all progress for this deck? All cards will go back to "Learning" status.')) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('flashcard_cards')
        .update({
          status: 'learning',
          review_count: 0,
          correct_count: 0
        })
        .eq('deck_id', currentDeck.id)
        .eq('user_id', user.id);

      if (error) throw error;

      // Update local state
      const resetCards = cards.map(c => ({
        ...c,
        status: 'learning' as const,
        review_count: 0,
        correct_count: 0
      }));
      setCards(resetCards);
      updateDeckStats(resetCards);
      preparePracticeCards(resetCards);
      
      toast({ title: 'Deck reset', description: 'All cards are now in learning mode.' });
    } catch (error) {
      console.error('Error resetting deck:', error);
      toast({ title: 'Failed to reset deck', variant: 'destructive' });
    }
  };

  const switchPracticeMode = (mode: PracticeMode) => {
    setPracticeMode(mode);
    preparePracticeCards(cards);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentCard = practiceCards[currentCardIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5 flex flex-col">
      <Navbar />
      
      {/* Sub Header for deck navigation */}
      {currentDeck && (
        <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-3 flex items-center">
            <Button variant="ghost" onClick={() => setCurrentDeck(null)} className="gap-2" size="sm">
              <ArrowLeft size={16} />
              Back to Decks
            </Button>
          </div>
        </header>
      )}

      <main className="container mx-auto px-4 py-8">
        {!currentDeck ? (
          /* Deck List View */
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">Your Decks</h2>
                <p className="text-muted-foreground">Create and manage vocabulary flashcards</p>
              </div>
              <Dialog open={showAddDeck} onOpenChange={setShowAddDeck}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <FolderPlus size={18} />
                    New Deck
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Deck</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Deck Name</Label>
                      <Input 
                        value={newDeckName}
                        onChange={(e) => setNewDeckName(e.target.value)}
                        placeholder="e.g., IELTS Academic Vocabulary"
                      />
                    </div>
                    <div>
                      <Label>Description (optional)</Label>
                      <Input 
                        value={newDeckDescription}
                        onChange={(e) => setNewDeckDescription(e.target.value)}
                        placeholder="Brief description of this deck"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAddDeck(false)}>Cancel</Button>
                    <Button onClick={createDeck}>Create Deck</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {decks.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Layers className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No decks yet</h3>
                  <p className="text-muted-foreground mb-4">Create your first deck to start learning vocabulary</p>
                  <Button onClick={() => setShowAddDeck(true)} className="gap-2">
                    <Plus size={18} />
                    Create Deck
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {decks.map((deck) => {
                  const masteredPercent = deck.card_count > 0 
                    ? Math.round((deck.mastered_count / deck.card_count) * 100) 
                    : 0;
                  
                  return (
                    <Card 
                      key={deck.id}
                      className="cursor-pointer hover:border-primary/30 hover:shadow-md transition-all"
                      onClick={() => selectDeck(deck)}
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center justify-between">
                          {deck.name}
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteDeck(deck.id);
                            }}
                          >
                            <Trash2 size={16} className="text-muted-foreground hover:text-destructive" />
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {deck.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{deck.description}</p>
                        )}
                        
                        {/* Progress stats */}
                        {deck.card_count > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-3 text-xs">
                              <div className="flex items-center gap-1">
                                <Brain className="w-3 h-3 text-amber-500" />
                                <span className="text-amber-600 dark:text-amber-400">{deck.learning_count}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Zap className="w-3 h-3 text-blue-500" />
                                <span className="text-blue-600 dark:text-blue-400">{deck.reviewing_count}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Target className="w-3 h-3 text-emerald-500" />
                                <span className="text-emerald-600 dark:text-emerald-400">{deck.mastered_count}</span>
                              </div>
                            </div>
                            <Progress 
                              value={masteredPercent} 
                              className="h-1.5"
                            />
                            <p className="text-[10px] text-muted-foreground text-right">{masteredPercent}% mastered</p>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between pt-1">
                          <Badge variant="secondary">{deck.card_count} cards</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(deck.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Flashcard Practice View */
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">{currentDeck.name}</h2>
                <p className="text-muted-foreground">{cards.length} cards</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetDeckProgress} disabled={cards.length === 0} title="Reset deck progress">
                  <RotateCcw size={18} />
                </Button>
                <Button variant="outline" onClick={shuffleCards} disabled={cards.length < 2}>
                  <Shuffle size={18} />
                </Button>
                <Dialog open={showAddCard} onOpenChange={setShowAddCard}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus size={18} />
                      Add Card
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Flashcard</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>Word/Phrase</Label>
                        <Input 
                          value={newCard.word}
                          onChange={(e) => setNewCard({ ...newCard, word: e.target.value })}
                          placeholder="e.g., ubiquitous"
                        />
                      </div>
                      <div>
                        <Label className="flex items-center gap-2">
                          Meaning/Translation
                          <Badge variant="outline" className="gap-1">
                            <Languages size={12} />
                            Auto-translate
                          </Badge>
                        </Label>
                        <Input 
                          value={newCard.meaning}
                          onChange={(e) => setNewCard({ ...newCard, meaning: e.target.value })}
                          placeholder="Leave empty for auto-translation"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Leave empty to auto-translate to Bengali
                        </p>
                      </div>
                      <div>
                        <Label>Example Sentence (optional)</Label>
                        <Input 
                          value={newCard.example}
                          onChange={(e) => setNewCard({ ...newCard, example: e.target.value })}
                          placeholder="The use of smartphones has become ubiquitous."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowAddCard(false)}>Cancel</Button>
                      <Button onClick={addCard} disabled={translating}>
                        {translating ? (
                          <>
                            <Loader2 size={14} className="animate-spin mr-2" />
                            Translating...
                          </>
                        ) : (
                          'Add Card'
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Progress Stats - Progressive Mode */}
            {practiceMode === 'progressive' && cards.length > 0 && (
              <Card className="mb-6 bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-3 gap-4 text-center mb-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-2">
                        <Brain className="w-4 h-4 text-amber-500" />
                        <span className="font-bold text-lg">{deckStats.learning}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Learning</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-2">
                        <Zap className="w-4 h-4 text-blue-500" />
                        <span className="font-bold text-lg">{deckStats.reviewing}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Reviewing</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-2">
                        <Target className="w-4 h-4 text-emerald-500" />
                        <span className="font-bold text-lg">{deckStats.mastered}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Mastered</p>
                    </div>
                  </div>
                  <Progress 
                    value={deckStats.total > 0 ? (deckStats.mastered / deckStats.total) * 100 : 0} 
                    className="h-2"
                  />
                  <p className="text-xs text-center text-muted-foreground mt-2">
                    {deckStats.total > 0 ? Math.round((deckStats.mastered / deckStats.total) * 100) : 0}% mastered
                  </p>
                </CardContent>
              </Card>
            )}

            {cards.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No cards in this deck</h3>
                  <p className="text-muted-foreground mb-4">Add your first flashcard to start learning</p>
                  <Button onClick={() => setShowAddCard(true)} className="gap-2">
                    <Plus size={18} />
                    Add Card
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="practice">
                <TabsList className="mb-6">
                  <TabsTrigger value="practice">Practice</TabsTrigger>
                  <TabsTrigger value="list">Card List</TabsTrigger>
                </TabsList>

                <TabsContent value="practice">
                  {/* Practice Mode Selector */}
                  <div className="flex justify-center gap-2 mb-6">
                    <Button 
                      variant={practiceMode === 'progressive' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => switchPracticeMode('progressive')}
                      className="gap-2"
                    >
                      <Brain size={16} />
                      Progressive
                    </Button>
                    <Button 
                      variant={practiceMode === 'static' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => switchPracticeMode('static')}
                      className="gap-2"
                    >
                      <Shuffle size={16} />
                      Static
                    </Button>
                  </div>

                  {sessionComplete ? (
                    <Card className="text-center py-12 max-w-md mx-auto">
                      <CardContent>
                        <Target className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
                        <h3 className="text-xl font-bold mb-2">Session Complete!</h3>
                        <p className="text-muted-foreground mb-4">
                          Great job! You've reviewed all available cards.
                        </p>
                        <Button onClick={() => restartSession()} className="gap-2">
                          <RotateCcw size={18} />
                          Practice Again
                        </Button>
                      </CardContent>
                    </Card>
                  ) : practiceCards.length === 0 ? (
                    <Card className="text-center py-12 max-w-md mx-auto">
                      <CardContent>
                        <Check className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
                        <h3 className="text-xl font-bold mb-2">All Mastered!</h3>
                        <p className="text-muted-foreground mb-4">
                          You've mastered all cards in this deck. Keep it up!
                        </p>
                        <Button onClick={() => restartSession(true)} variant="outline" className="gap-2">
                          <RotateCcw size={18} />
                          Review All
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="max-w-md mx-auto">
                      {/* Status Badge */}
                      {practiceMode === 'progressive' && currentCard && (
                        <div className="flex justify-center mb-4">
                          <Badge 
                            variant="outline"
                            className={cn(
                              "gap-1",
                              currentCard.status === 'learning' && "border-amber-500 text-amber-600",
                              currentCard.status === 'reviewing' && "border-blue-500 text-blue-600",
                              currentCard.status === 'mastered' && "border-emerald-500 text-emerald-600"
                            )}
                          >
                            {currentCard.status === 'learning' && <Brain size={12} />}
                            {currentCard.status === 'reviewing' && <Zap size={12} />}
                            {currentCard.status === 'mastered' && <Target size={12} />}
                            {currentCard.status.charAt(0).toUpperCase() + currentCard.status.slice(1)}
                          </Badge>
                        </div>
                      )}

                      {/* Flashcard */}
                      <div 
                        className="relative h-64 cursor-pointer perspective-1000"
                        onClick={() => setIsFlipped(!isFlipped)}
                      >
                        <div className={cn(
                          "absolute inset-0 transition-transform duration-500 transform-style-3d",
                          isFlipped && "rotate-y-180"
                        )}>
                          {/* Front */}
                          <Card className={cn(
                            "absolute inset-0 backface-hidden flex items-center justify-center",
                            "bg-gradient-to-br from-primary/10 to-accent/10"
                          )}>
                            <CardContent className="text-center overflow-y-auto max-h-full p-4">
                              <p className="text-3xl font-bold break-words">{currentCard?.word}</p>
                              <p className="text-sm text-muted-foreground mt-4">Click to flip</p>
                            </CardContent>
                          </Card>

                          {/* Back */}
                          <Card className={cn(
                            "absolute inset-0 backface-hidden rotate-y-180 flex items-center justify-center",
                            "bg-gradient-to-br from-accent/10 to-primary/10"
                          )}>
                            <CardContent className="text-center space-y-4 overflow-y-auto max-h-full p-4">
                              <p className="text-2xl font-medium break-words">{currentCard?.meaning}</p>
                              {currentCard?.example && (
                                <p className="text-sm text-muted-foreground italic break-words">
                                  "{currentCard?.example}"
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </div>

                      {/* Navigation / Response Buttons */}
                      {practiceMode === 'progressive' ? (
                        <div className="flex items-center justify-center gap-4 mt-6">
                          <Button 
                            variant="outline"
                            size="lg"
                            onClick={() => handleCardResponse(false)}
                            className="gap-2 border-rose-500 text-rose-600 hover:bg-rose-50"
                          >
                            <X size={20} />
                            I didn't know
                          </Button>
                          <Button 
                            size="lg"
                            onClick={() => handleCardResponse(true)}
                            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                          >
                            <Check size={20} />
                            I knew this
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between mt-6">
                          <Button 
                            variant="outline" 
                            onClick={prevCard} 
                            disabled={currentCardIndex === 0}
                          >
                            <ChevronLeft size={18} />
                          </Button>
                          
                          <span className="text-muted-foreground">
                            {currentCardIndex + 1} / {practiceCards.length}
                          </span>
                          
                          <Button 
                            variant="outline" 
                            onClick={nextCard} 
                            disabled={currentCardIndex === practiceCards.length - 1}
                          >
                            <ChevronRight size={18} />
                          </Button>
                        </div>
                      )}

                      {/* Progress indicator for progressive mode */}
                      {practiceMode === 'progressive' && (
                        <p className="text-center text-sm text-muted-foreground mt-4">
                          Card {currentCardIndex + 1} of {practiceCards.length}
                        </p>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="list">
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {cards.map((card) => (
                        <Card key={card.id} className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium">{card.word}</p>
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-xs",
                                    card.status === 'learning' && "border-amber-500 text-amber-600",
                                    card.status === 'reviewing' && "border-blue-500 text-blue-600",
                                    card.status === 'mastered' && "border-emerald-500 text-emerald-600"
                                  )}
                                >
                                  {card.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{card.meaning}</p>
                              {card.example && (
                                <p className="text-xs text-muted-foreground italic mt-1">"{card.example}"</p>
                              )}
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => deleteCard(card.id)}
                            >
                              <Trash2 size={16} className="text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
      </main>

      <Footer />

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}
