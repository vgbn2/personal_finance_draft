/*
 * Filename: C06035.c
 * Description: C Program using functions: solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <string.h>

// Function to solve specific test case
void solve()
{
    char s[21];
    gets(s);
    int len = strlen(s);
    int turn = 0;
    int i = 0, j = len - 1;
    while (i <= j)
    {
        if (i == j && turn == 0)
            turn = 1;
        if (s[i] != s[j])
            turn += 1;
        i++;
        j--;
    }
    if (turn == 1)
        printf("YES\n"); // Print result
    else
        printf("NO\n"); // Print result
}

// Entry point
int main()
{
    int t;
    scanf("%d\n", &t); // Read input
    while (t--)
        solve();
    return 0;
}