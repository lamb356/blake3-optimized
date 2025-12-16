#!/usr/bin/env python3

# This is an example implementation of Bao, with the goal of being as readable
# as possible and generating test vectors. There are a few differences that
# make this code much simpler than the Rust version:
#
# 1. This version's encode implementation buffers all input and output in
#    memory. The Rust version uses a more complicated tree-flipping strategy to
#    avoid using extra storage.
# 2. This version isn't incremental. The Rust version provides incremental
#    encoders and decoders, which accept small reads and writes from the
#    caller, and that requires more bookkeeping.
# 3. This version doesn't support arbitrary seeking. The most complicated bit
#    of bookkeeping in the Rust version is seeking in the incremental decoder.
#
# Some more specific details about how each part of this implementation works:
#
# *bao_decode*, *bao_slice*, and *bao_decode_slice* are recursive streaming
# implementations. Recursion is easy here because the length header at the
# start of the encoding tells us all we need to know about the layout of the
# tree. The pre-order layout means that neither of the decode functions needs
# to seek (though bao_slice does, to skip the parts that aren't in the slice).
#
# *bao_hash* (identical to the BLAKE3 hash function) is an iterative streaming
# implementation, which is closer to an incremental implementation than the
# recursive functions are. Recursion doesn't work well here, because we don't
# know the length of the input in advance. Instead, we keep a stack of subtrees
# filled so far, merging them as we go along. There is a very cute trick, where
# the number of subtree hashes that should remain in the stack is the same as
# the number of 1's in the binary representation of the count of chunks so far.
# (E.g. If you've read 255 chunks so far, then you have 8 partial subtrees. One
# of 128 chunks, one of 64 chunks, and so on. After you read the 256th chunk,
# you can merge all of those into a single subtree.) That, plus the fact that
# merging is always done smallest-to-largest / at the top of the stack, means
# that we don't need to remember the size of each subtree; just the hash is
# enough.
#
# *bao_encode* is a recursive implementation, but as noted above, it's not
# streaming. Instead, to keep things simple, it buffers the entire input and
# output in memory. The Rust implementation uses a more complicated
# tree-flipping strategy to avoid hogging memory like this, where it writes the
# output tree first in a post-order layout, and then does a second pass
# back-to-front to flip it in place to pre-order.

__doc__ = """\
Usage: bao.py hash [<inputs>...]
       bao.py encode <input> (<output> | --outboard=<file>)
       bao.py decode <hash> [<input>] [<output>] [--outboard=<file>]
       bao.py slice <start> <count> [<input>] [<output>] [--outboard=<file>]
       bao.py decode-slice <hash> <start> <count> [<input>] [<output>]
"""

import binascii
import hmac
import sys

# the BLAKE3 initialization constants
IV = [
    0x6A09E667,
    0xBB67AE85,
    0x3C6EF372,
    0xA54FF53A,
    0x510E527F,
    0x9B05688C,
    0x1F83D9AB,
    0x5BE0CD19,
]

# the BLAKE3 message schedule
MSG_SCHEDULE = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8],
    [3, 4, 10, 12, 13, 2, 7, 14, 6, 5, 9, 0, 11, 15, 8, 1],
    [10, 7, 12, 9, 14, 3, 13, 15, 4, 0, 11, 2, 5, 8, 1, 6],
    [12, 13, 9, 11, 15, 10, 14, 8, 7, 2, 5, 3, 0, 1, 6, 4],
    [9, 14, 11, 5, 8, 12, 15, 1, 13, 3, 0, 10, 2, 6, 4, 7],
    [11, 15, 5, 0, 1, 9, 8, 6, 14, 10, 2, 12, 3, 4, 7, 13],
]

BLOCK_SIZE = 64
CHUNK_SIZE = 1024
KEY_SIZE = 32
HASH_SIZE = 32
PARENT_SIZE = 2 * HASH_SIZE
WORD_BITS = 32
WORD_BYTES = 4
WORD_MAX = 2**WORD_BITS - 1
HEADER_SIZE = 8

# domain flags
CHUNK_START = 1 << 0
CHUNK_END = 1 << 1
PARENT = 1 << 2
ROOT = 1 << 3
KEYED_HASH = 1 << 4
DERIVE_KEY = 1 << 5

# finalization flags
IS_ROOT = object()
NOT_ROOT = object()


def wrapping_add(a, b):
    return (a + b) & WORD_MAX


def rotate_right(x, n):
    return (x >> n | x << (WORD_BITS - n)) & WORD_MAX


# The BLAKE3 G function.
def g(state, a, b, c, d, x, y):
    state[a] = wrapping_add(state[a], wrapping_add(state[b], x))
    state[d] = rotate_right(state[d] ^ state[a], 16)
    state[c] = wrapping_add(state[c], state[d])
    state[b] = rotate_right(state[b] ^ state[c], 12)
    state[a] = wrapping_add(state[a], wrapping_add(state[b], y))
    state[d] = rotate_right(state[d] ^ state[a], 8)
    state[c] = wrapping_add(state[c], state[d])
    state[b] = rotate_right(state[b] ^ state[c], 7)


# the BLAKE3 round function
def round(state, msg_words, schedule):
    # Mix the columns.
    g(state, 0, 4, 8, 12, msg_words[schedule[0]], msg_words[schedule[1]])
    g(state, 1, 5, 9, 13, msg_words[schedule[2]], msg_words[schedule[3]])
    g(state, 2, 6, 10, 14, msg_words[schedule[4]], msg_words[schedule[5]])
    g(state, 3, 7, 11, 15, msg_words[schedule[6]], msg_words[schedule[7]])
    # Mix the rows.
    g(state, 0, 5, 10, 15, msg_words[schedule[8]], msg_words[schedule[9]])
    g(state, 1, 6, 11, 12, msg_words[schedule[10]], msg_words[schedule[11]])
    g(state, 2, 7, 8, 13, msg_words[schedule[12]], msg_words[schedule[13]])
    g(state, 3, 4, 9, 14, msg_words[schedule[14]], msg_words[schedule[15]])


def words_from_bytes(buf):
    words = [0] * (len(buf) // WORD_BYTES)
    for word_i in range(len(words)):
        words[word_i] = int.from_bytes(
            buf[word_i * WORD_BYTES : (word_i + 1) * WORD_BYTES], "little"
        )
    return words


def bytes_from_words(words):
    buf = bytearray(len(words) * WORD_BYTES)
    for word_i in range(len(words)):
        buf[WORD_BYTES * word_i : WORD_BYTES * (word_i + 1)] = words[word_i].to_bytes(
            WORD_BYTES, "little"
        )
    return buf


# The truncated BLAKE3 compression function.
def compress(cv, block, block_len, offset, flags):
    block_words = words_from_bytes(block)
    state = [
        cv[0],
        cv[1],
        cv[2],
        cv[3],
        cv[4],
        cv[5],
        cv[6],
        cv[7],
        IV[0],
        IV[1],
        IV[2],
        IV[3],
        offset & WORD_MAX,
        (offset >> WORD_BITS) & WORD_MAX,
        block_len,
        flags,
    ]
    for round_number in range(7):
        round(state, block_words, MSG_SCHEDULE[round_number])
    return [state[i] ^ state[i + 8] for i in range(8)]


# Compute a BLAKE3 chunk chaining value.
def chunk_chaining_value(chunk_bytes, chunk_index, finalization):
    cv = IV[:]
    i = 0
    flags = CHUNK_START
    while len(chunk_bytes) - i > BLOCK_SIZE:
        block = chunk_bytes[i : i + BLOCK_SIZE]
        cv = compress(cv, block, BLOCK_SIZE, chunk_index, flags)
        flags = 0
        i += BLOCK_SIZE
    flags |= CHUNK_END
    if finalization is IS_ROOT:
        flags |= ROOT
    block = chunk_bytes[i:]
    block_len = len(block)
    block += b"\0" * (BLOCK_SIZE - block_len)
    cv = compress(cv, block, block_len, chunk_index, flags)
    return bytes_from_words(cv)


# Compute a BLAKE3 parent node chaining value.
def parent_chaining_value(parent_bytes, finalization):
    cv = IV[:]
    flags = PARENT
    if finalization is IS_ROOT:
        flags |= ROOT
    cv = compress(cv, parent_bytes, BLOCK_SIZE, 0, flags)
    return bytes_from_words(cv)


# Verify a chunk chaining value with a constant-time comparison.
def verify_chunk(expected_cv, chunk_bytes, chunk_index, finalization):
    found_cv = chunk_chaining_value(chunk_bytes, chunk_index, finalization)
    assert hmac.compare_digest(expected_cv, found_cv), "hash mismatch"


# Verify a parent node chaining value with a constant-time comparison.
def verify_parent(expected_cv, parent_bytes, finalization):
    found_cv = parent_chaining_value(parent_bytes, finalization)
    assert hmac.compare_digest(expected_cv, found_cv), "hash mismatch"


def read_exact(stream, n):
    out = bytearray(n)
    mv = memoryview(out)
    while mv:
        n = stream.readinto(mv)
        if n == 0:
            raise IOError("unexpected EOF")
        mv = mv[n:]
    return out


def encode_len(content_len):
    return content_len.to_bytes(HEADER_SIZE, "little")


def decode_len(len_bytes):
    return int.from_bytes(len_bytes, "little")


# Left subtrees contain the largest possible power of two chunks, with at least
# one byte left for the right subtree.
def left_len(parent_len):
    available_chunks = (parent_len - 1) // CHUNK_SIZE
    power_of_two_chunks = 2 ** (available_chunks.bit_length() - 1)
    return CHUNK_SIZE * power_of_two_chunks


def bao_encode(buf, *, outboard=False):
    chunk_index = 0

    def encode_recurse(buf, finalization):
        nonlocal chunk_index
        if len(buf) <= CHUNK_SIZE:
            chunk_cv = chunk_chaining_value(buf, chunk_index, finalization)
            chunk_encoded = b"" if outboard else buf
            chunk_index += 1
            return chunk_encoded, chunk_cv
        llen = left_len(len(buf))
        # Interior nodes have no len suffix.
        left_encoded, left_cv = encode_recurse(buf[:llen], NOT_ROOT)
        right_encoded, right_cv = encode_recurse(buf[llen:], NOT_ROOT)
        node = left_cv + right_cv
        encoded = node + left_encoded + right_encoded
        return encoded, parent_chaining_value(node, finalization)

    # Only this topmost call sets a non-None finalization.
    encoded, hash_ = encode_recurse(buf, IS_ROOT)
    # The final output prefixes the encoded length.
    output = encode_len(len(buf)) + encoded
    return output, hash_


def bao_decode(input_stream, output_stream, hash_, *, outboard_stream=None):
    tree_stream = outboard_stream or input_stream
    chunk_index = 0

    def decode_recurse(subtree_cv, content_len, finalization):
        nonlocal chunk_index
        if content_len <= CHUNK_SIZE:
            chunk = read_exact(input_stream, content_len)
            verify_chunk(subtree_cv, chunk, chunk_index, finalization)
            chunk_index += 1
            output_stream.write(chunk)
        else:
            parent = read_exact(tree_stream, PARENT_SIZE)
            verify_parent(subtree_cv, parent, finalization)
            left_cv, right_cv = parent[:HASH_SIZE], parent[HASH_SIZE:]
            llen = left_len(content_len)
            decode_recurse(left_cv, llen, NOT_ROOT)
            decode_recurse(right_cv, content_len - llen, NOT_ROOT)

    content_len = decode_len(read_exact(tree_stream, HEADER_SIZE))
    decode_recurse(hash_, content_len, IS_ROOT)


# This is identical to the BLAKE3 hash function.
def bao_hash(input_stream):
    buf = b""
    chunks = 0
    subtrees = []
    while True:
        read = input_stream.read(CHUNK_SIZE)
        if not read:
            if chunks == 0:
                return chunk_chaining_value(buf, chunks, IS_ROOT)
            new_subtree = chunk_chaining_value(buf, chunks, NOT_ROOT)
            while len(subtrees) > 1:
                parent = subtrees.pop() + new_subtree
                new_subtree = parent_chaining_value(parent, NOT_ROOT)
            return parent_chaining_value(subtrees[0] + new_subtree, IS_ROOT)
        if len(buf) >= CHUNK_SIZE:
            new_subtree = chunk_chaining_value(buf[:CHUNK_SIZE], chunks, NOT_ROOT)
            chunks += 1
            total_after_merging = bin(chunks).count("1")
            while len(subtrees) + 1 > total_after_merging:
                parent = subtrees.pop() + new_subtree
                new_subtree = parent_chaining_value(parent, NOT_ROOT)
            subtrees.append(new_subtree)
            buf = buf[CHUNK_SIZE:]
        buf = buf + read


def count_chunks(content_len):
    if content_len == 0:
        return 1
    return (content_len + CHUNK_SIZE - 1) // CHUNK_SIZE


def encoded_subtree_size(content_len, outboard=False):
    parents_size = PARENT_SIZE * (count_chunks(content_len) - 1)
    return parents_size if outboard else parents_size + content_len


def bao_slice(
    input_stream, output_stream, slice_start, slice_len, outboard_stream=None
):
    tree_stream = outboard_stream or input_stream
    content_len_bytes = read_exact(tree_stream, HEADER_SIZE)
    output_stream.write(content_len_bytes)
    content_len = decode_len(content_len_bytes)

    if slice_len == 0:
        slice_len = 1
    slice_end = slice_start + slice_len

    if slice_start >= content_len:
        slice_start = content_len - 1 if content_len > 0 else 0

    def slice_recurse(subtree_start, subtree_len):
        subtree_end = subtree_start + subtree_len
        if subtree_end <= slice_start:
            parent_nodes_size = encoded_subtree_size(subtree_len, outboard=True)
            tree_stream.seek(parent_nodes_size, 1)
            input_stream.seek(subtree_len, 1)
        elif slice_end <= subtree_start:
            pass
        elif subtree_len <= CHUNK_SIZE:
            chunk = read_exact(input_stream, subtree_len)
            output_stream.write(chunk)
        else:
            parent = read_exact(tree_stream, PARENT_SIZE)
            output_stream.write(parent)
            llen = left_len(subtree_len)
            slice_recurse(subtree_start, llen)
            slice_recurse(subtree_start + llen, subtree_len - llen)

    slice_recurse(0, content_len)


def bao_decode_slice(input_stream, output_stream, hash_, slice_start, slice_len):
    content_len_bytes = read_exact(input_stream, HEADER_SIZE)
    content_len = decode_len(content_len_bytes)

    skip_output = False
    if slice_len == 0:
        slice_len = 1
        skip_output = True
    slice_end = slice_start + slice_len

    if slice_start >= content_len:
        slice_start = content_len - 1 if content_len > 0 else 0
        skip_output = True

    def decode_slice_recurse(subtree_start, subtree_len, subtree_cv, finalization):
        subtree_end = subtree_start + subtree_len
        if subtree_end <= slice_start and content_len > 0:
            pass
        elif slice_end <= subtree_start and content_len > 0:
            pass
        elif subtree_len <= CHUNK_SIZE:
            chunk = read_exact(input_stream, subtree_len)
            chunk_index = subtree_start // CHUNK_SIZE
            verify_chunk(subtree_cv, chunk, chunk_index, finalization)
            chunk_start = max(0, min(subtree_len, slice_start - subtree_start))
            chunk_end = max(0, min(subtree_len, slice_end - subtree_start))
            if not skip_output:
                output_stream.write(chunk[chunk_start:chunk_end])
        else:
            parent = read_exact(input_stream, PARENT_SIZE)
            verify_parent(subtree_cv, parent, finalization)
            left_cv, right_cv = parent[:HASH_SIZE], parent[HASH_SIZE:]
            llen = left_len(subtree_len)
            decode_slice_recurse(subtree_start, llen, left_cv, NOT_ROOT)
            decode_slice_recurse(
                subtree_start + llen, subtree_len - llen, right_cv, NOT_ROOT
            )

    decode_slice_recurse(0, content_len, hash_, IS_ROOT)


def open_input(maybe_path):
    if maybe_path is None or maybe_path == "-":
        return sys.stdin.buffer
    return open(maybe_path, "rb")


def open_output(maybe_path):
    if maybe_path is None or maybe_path == "-":
        return sys.stdout.buffer
    return open(maybe_path, "w+b")


def main():
    try:
        import docopt
        args = docopt.docopt(__doc__)
    except ImportError:
        print("docopt not available, running in library mode only")
        return

    in_stream = open_input(args["<input>"])
    out_stream = open_output(args["<output>"])
    if args["encode"]:
        outboard = False
        if args["--outboard"] is not None:
            outboard = True
            out_stream = open_output(args["--outboard"])
        encoded, _ = bao_encode(in_stream.read(), outboard=outboard)
        out_stream.write(encoded)
    elif args["decode"]:
        hash_ = binascii.unhexlify(args["<hash>"])
        outboard_stream = None
        if args["--outboard"] is not None:
            outboard_stream = open_input(args["--outboard"])
        bao_decode(in_stream, out_stream, hash_, outboard_stream=outboard_stream)
    elif args["hash"]:
        inputs = args["<inputs>"]
        if len(inputs) > 0:
            for name in inputs:
                hash_ = bao_hash(open_input(name))
                if len(inputs) > 1:
                    print("{}  {}".format(hash_.hex(), name))
                else:
                    print(hash_.hex())
        else:
            hash_ = bao_hash(in_stream)
            print(hash_.hex())
    elif args["slice"]:
        outboard_stream = None
        if args["--outboard"] is not None:
            outboard_stream = open_input(args["--outboard"])
        bao_slice(
            in_stream,
            out_stream,
            int(args["<start>"]),
            int(args["<count>"]),
            outboard_stream,
        )
    elif args["decode-slice"]:
        hash_ = binascii.unhexlify(args["<hash>"])
        bao_decode_slice(
            in_stream, out_stream, hash_, int(args["<start>"]), int(args["<count>"])
        )


if __name__ == "__main__":
    main()
