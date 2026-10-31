# Using the box

**Putting a book on it.** Record the book with your phone's voice-memo app, one file or several.
Unplug the box and take the microSD card out from underneath. On a computer, make a folder inside
tape/audio named with small letters, numbers and dashes, like gran-gruffalo, and copy the
recordings into it. They play in the order of their names, so 01, 02, 03 works. Put the card back
and plug the box in.

**Giving it a card.** Put a new card on the box. It takes the first book that has no card yet, in
the order of the folder names, and starts playing. From then on that card always plays that book.

**The short sound.** If you put a new card on and there is no book left without a card, the box
plays a short sound and remembers the card in tape/unknown.txt. Add a book and try the card again.

**Taking a card off** pauses the book; putting it back carries on. When a book ends it stays quiet
until you take the card off and put it back, and then it starts again from the beginning.

**Please don't delete cards.json.** It is the list of which card plays which book. If it does go
missing, the box remembers the list and puts it back, and writes so in tape/log.txt. To start over
on purpose, replace its contents with {} and every card will pick a book again.
