This folder contains a test harness for the sorted-btree library

It was created to ensure that the sorted-btree library has no bugs, in the codepaths that we use.

## How to use

1. yarn build
1. node ./dist/src/tests/sorted-btree/test-generator.js

The main function is in `test-generator.ts`. Since it is a Typescript file, you first have to run `yarn build` from the root of this repro, which will generate the JS files for all typescript files.

Then, you can run `node ./dist/src/tests/sorted-btree/test-generator.js` from the root of this repo to start the test generation.

If the test generator detects no errors, it will not produce any output. It takes about 2s to finish all tests.

If an error is detected, it will print to the console log. An example output looks something like this:

```
Operation failed: GET_INDEX
Size of history: 72
Repro detection time: 0s 8.7161ms

Attempting to shrink history...
Checked 110 shrunk histories
Shrink time: 0s 7.8753ms

Minimal repro of size 7 (90% decrease)
Details of this failure: keyRange 10 - ran 1 rounds
Writing generated test case to 2021-08-05T19-13-28-264Z.spec.js
```

And if you look inside of `src/tests/sorted-btree/generated/`, you will find a test file that is named like:
`src\tests\sorted-btree\generated\2021-08-05T19-13-28-264Z.spec.js`!

If you feel that this test file looks good, you can add it to `SortedBTree.spec.ts` to add it to the regression test suite, which is run as part of every CI build.

## How it works

The test generator works by generating random Get/Set commands on the BTree, with random keys and values, and validating that the sorted-btree package returns what we expect it to return.

Let's take a closer look at the output from the test generator when it detects an error:

```
Operation failed: GET_INDEX
Size of history: 72
```

These two lines say that the test generator detected that the BTree returned an error for the operation GET Index. This operation gets the i'th key from the tree in ascending order (according to the comparator). This error occured after 72 operations.

However, if we tried to debug these 72 operations, most of them would probably be irrelevant to the actual error.

So, as part of the next step, the generator tries to _shrink_ the generated output.

Under `shrink.ts`, you'll find a simple test shrinker. The comments there give more description, but basically it tries to keep the beginning and the end of the list of commands. This is based on the heuristic that the first few commands and the last few commands are _probably_ more related to the error that we see.

Once it can't shrink any longer, it reports the shrinkage:

```
Attempting to shrink history...
Checked 110 shrunk histories
Minimal repro of size 7 (90% decrease)
```

As you can see, we have been quite effective at shrinking a list of 72 operations down to 7! As the generator reports, this is a 90% decrease.

Lastly, the test generator will write it to a file. The details for this are in `produce-repro-file.ts`. In a CI build, it will not write to a file, instead printing it to stdout so it can be copied into a file locally.

The rest of the lines are about giving some details about how quickly the failure was detected.
