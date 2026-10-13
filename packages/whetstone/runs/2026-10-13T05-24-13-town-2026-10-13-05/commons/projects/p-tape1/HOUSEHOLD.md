# Using the story box

## Recording a book

Read the book aloud into a phone or laptop, one chapter or a few pages at a time. Each piece is
one file. Any common audio format works (m4a, mp3, wav, ogg, opus, flac, aac or amr). Name the
files so they sort in the order they should play: `01.m4a`, `02.m4a` and so on. Use two digits,
or `10` will play before `2`.

## Copying it to the box

1. Take the microSD card out of the box (unplug the box first) and put it in the laptop.
2. Make the book's folder **on the laptop first**, inside one folder you keep for the box (call
   it `tape-books`). Name it with lower-case letters, digits and dashes only, like `gruffalo` or
   `bedtime-2`. A folder named any other way (with capitals or spaces, say) is skipped, and the
   box writes `bad-folder` in its log.
3. Copy (don't move) that folder into `tape/audio` on the card, then eject the card properly
   before you pull it out. The laptop's `tape-books` now holds the originals and the card holds
   copies, so the backup is made by doing this step, not by remembering to do another one.
4. Put the card back and plug the box in.

A Mac leaves hidden files starting with `._` beside every file it copies. The box ignores them.

## Giving it a card

Put a card the box hasn't seen before on the lid. It is given the **first new book** in
alphabetical order of folder names, and starts playing it. That card belongs to that book from
then on. To pick which book a card gets, add one book at a time and give it a card before you
add the next.

## The short sound

If you put a new card on the box and every book already has a card, the box makes a short sound
and plays nothing. Add a new book and put the card on again. The box writes the card's number in
`tape/unknown.txt`, so you can see which cards were turned away.

## What not to delete

- **`tape/audio/`**: your recordings. **They are the only thing that can't be replaced.** If you
  add books the way above, `tape-books` on the laptop already has every one. Never delete a book
  from `tape-books`, and back the laptop up with the rest of its files. If a book was ever put on
  the card some other way, copy it back into `tape-books` now.
- **`tape/cards.json`**: which card plays which book. If it gets deleted or broken, the box
  remembers and puts it back. Don't edit it unless you mean to. Replacing its whole contents with
  `{}` makes every card new again.
- `tape/log.txt` is the box's diary. Deleting it does no harm.

## Lifting and putting back

Lifting a card pauses the story. Putting it back carries on from the start of the same chapter,
until the box is unplugged. When a book ends, the box goes quiet. Lift the card and put it back
to hear it from the beginning. Two cards on the lid at once pause everything until only one is
left.
