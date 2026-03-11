/*
 * Filename: C03055.c
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
    for (int i = 0; i < l; i++)
    {
        if (s[i] == '0' && s[i + 1] == '8' && s[i + 2] == '4' && i + 2 < l)
            i += 2;
        else
            printf("%c", s[i]); // Print result
    }
    printf("\n"); // Print result
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