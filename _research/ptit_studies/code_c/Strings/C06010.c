/*
 * Filename: C06010.c
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
#include <stdbool.h>

// Function to solve specific test case
void solve()
{
    char s[501];
    scanf("%s", &s); // Read input
    int l = strlen(s);
    bool check = 1;
    for (int i = 0, j = l - 1; i <= (l / 2 - 1); i++, j--)
        if (s[i] != s[j] || s[i] % 2 != 0)
        {
            check = 0;
            break;
        }
    if (l % 2 != 0 && s[l / 2] % 2 != 0)
        check = 0;
    if (check)
        printf("YES\n"); // Print result
    else
        printf("NO\n"); // Print result
}

// Entry point
int main()
{
    int t;
    scanf("%d", &t); // Read input
    while (t--)
        solve();
    return 0;
}