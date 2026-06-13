"""Inventory — items the player has taken from the world. Hot path, pure SQL.

An inventory row is an instance of a crystallized `item` content_item the player
picked up. `requires.items` gates (via state_gate.inventory_tokens) read off these.
"""

from storage.content_store import execute, fetch, fetch_one


def take(player_id: str, content_item_id: str, qty: int = 1) -> dict:
    """Add an item instance to the player's inventory; returns the new row."""
    return fetch_one(
        "INSERT INTO player_inventory (player_id, content_item_id, qty) "
        "VALUES (%s, %s, %s) RETURNING id, content_item_id, qty",
        (player_id, content_item_id, qty),
    )


def list_inventory(player_id: str) -> list[dict]:
    """Inventory rows joined to their content + which slot (if any) they're equipped in."""
    return fetch(
        """
        SELECT pi.id, pi.qty, ci.id AS content_item_id, ci.type,
               ci.content ->> 'name'        AS name,
               ci.content ->> 'description'  AS description,
               ci.content -> 'mechanics'     AS mechanics,
               (SELECT slot FROM player_equipment pe
                 WHERE pe.player_id = pi.player_id AND pe.inventory_id = pi.id) AS equipped_slot
        FROM player_inventory pi JOIN content_items ci ON ci.id = pi.content_item_id
        WHERE pi.player_id = %s
        ORDER BY pi.acquired_at
        """,
        (player_id,),
    )


def owns(player_id: str, inventory_id: str) -> bool:
    return fetch_one(
        "SELECT 1 FROM player_inventory WHERE id = %s AND player_id = %s", (inventory_id, player_id)
    ) is not None


def drop(player_id: str, inventory_id: str) -> bool:
    """Remove an inventory item (its equipment row cascades away)."""
    if not owns(player_id, inventory_id):
        return False
    execute("DELETE FROM player_inventory WHERE id = %s AND player_id = %s", (inventory_id, player_id))
    return True
