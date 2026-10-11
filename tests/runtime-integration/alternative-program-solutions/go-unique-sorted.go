package main

import (
  "encoding/json"
  "io"
  "os"
  "slices"
)

func main() {
  source, err := io.ReadAll(os.Stdin)
  if err != nil { panic(err) }
  numbers := []int64{}
  if err := json.Unmarshal(source, &numbers); err != nil { panic(err) }
  slices.Sort(numbers)
  numbers = slices.Compact(numbers)
  json.NewEncoder(os.Stdout).Encode(numbers)
}
