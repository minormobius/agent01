# The tape box: for the household

Put a card on the lid and it plays that card's book. Lift the card off and it pauses. Put it back and
it carries on from that track. When a book ends, the box goes quiet. Lift the card and put it back
to hear the book again from the start.

## Recording a book

Any phone or computer recorder will do. Save each chapter as its own file. The box plays these kinds:
**mp3, m4a, aac, wav, ogg, opus, flac, amr**.

Name the files so they sort in the order you want them played, **with leading zeros**:
`01.m4a`, `02.m4a`, … `10.m4a`. The box sorts names letter by letter, so without the zeros `10`
would play before `2`.

## Copying it onto the SD card

Each book is one folder inside `tape/audio/` on the SD card. The folder's name is the book's name.
It has to be:

- **lower-case letters, digits and hyphens only**, no spaces, no capitals,
- starting with a letter or a digit,
- 32 characters at most.

`the-tale-of-peter-rabbit` works. `Peter Rabbit` doesn't. The box skips a folder with a name like
that and writes `bad-folder` and the name in `tape/log.txt`. Rename the folder and it's fine.

A Mac leaves a hidden `._` file next to every file it copies, and sometimes a `.DS_Store`. They're
harmless. The box ignores them.

Put the SD card back and switch the box on. It looks for new books when it starts.

## Giving a book a card

Copy the book first, then put a **new card** on the lid. A new card takes the first book, in
alphabetical order, that has no card yet, and starts playing it at once. **That card belongs to
that book from then on.** Label the card straight away.

If you've added several books at once and want to know which card gets which, add the cards one at
a time and listen to each before you label it.

Put a new card down flat and leave it there. Very rarely, a reader catches a new card's first touch
only partly. Then you hear one book for a blink, and after it a different one. When that happens, the
blink's book has been given to nothing. Look in `tape/log.txt` for a `bind` line that names
`uid:` followed by letters and numbers. Free that book by removing that one entry from `cards.json`
(see "Starting over, or freeing one card" below).

## The short sound

A short sound with no book after it means one of two things:

1. **Every book already has a card.** The card is new and there's nothing free to give it. Copy
   another book, switch the box off and on, then try the card again. (The box notes each such card in
   `tape/unknown.txt`. You can delete that file whenever you like.)
2. **The card's book folder is gone or renamed.** The card still remembers its book. Put the folder
   back under its old name and the card plays it again.

## What not to delete

- **`tape/cards.json`**: the list of which card plays which book. If it goes missing, the box puts it
  back from its own memory. That only works in the same box, though. If you move the SD card to a new
  box, keep this file.
- **`tape/audio/<book>/` of a book that has a card.** Renaming the folder counts as deleting it (see
  the short sound, above).

Safe to delete: `tape/log.txt`, `tape/unknown.txt`, and any `tape/cards.bad`, `cards.bad.2`, … files.

## Starting over, or freeing one card

`cards.json` is plain text. Open it in a text editor and save it as plain UTF-8:

- To **start the whole deck over**, replace everything in it with `{}` and save. Every card is then
  new again.
- To **free one card**, delete its line. Find the card's id in `tape/log.txt`, on the `bind` line
  with its book's name. Mind the commas: the last entry has none after it.

If the file stops making sense to the box (a stray comma, a half-saved edit), the box doesn't
guess. It moves your text aside to `tape/cards.bad` (and `cards.bad.2` the next time, so the first
copy is never lost) and goes back to the list it last trusted.

## Power

Unplugging is always safe, even right as you put a new card on. In the worst case that card isn't
remembered and gets a book the next time you put it down.

## Before anything is printed: the hour of polls

The box decides a card has been lifted when it gets no read of it for **1 second**. That number is a
guess until we see your reader through a plate as thick as the lid. Please record an hour:

- a card resting where it will really sit, on the plate, untouched;
- one line per read the reader tries: the time in seconds, a space, then the card's id, or `-` when
  it read nothing;
- if your reader can tell, a third word on each line with an id: `ok` if it also read the card's
  book data, `torn` if it got the id but not the data. Use a card that already has a book.

What matters is not how often the reader misses. It's **how many misses come in a row**. If the misses
come in long runs, no setting fixes it, and the plate or the antenna has to change. Better to find
that out before you print. The `torn` count says how often a card set down could be taken for a new
one.
