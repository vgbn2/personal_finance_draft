/*
 * Filename: C03036.c
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
    char s[20];
    scanf("%s", s); // Read input
    int l = strlen(s);
    if (l % 2 == 0)
    {
        printf("NO\n"); // Print result
        return;
    }
    for (int i = 0; i < l / 2; i++)
    {
        if ((s[i] - '0') % 2 == 0 || s[i] != s[l - 1 - i])
        {
            printf("NO\n"); // Print result
            return;
        }
    }
    printf("YES\n"); // Print result
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