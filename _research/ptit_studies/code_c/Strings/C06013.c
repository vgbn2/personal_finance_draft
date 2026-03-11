/*
 * Filename: C06013.c
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
    char s[1005] = {};
    scanf("%s", s); // Read input
    int d = 0;
    bool dd[10] = {0};
    for (int i = 0; i < strlen(s); i++)
    {
        if (s[0] == '0' || s[i] < '0' || s[i] > '9')
        {
            printf("INVALID\n"); // Print result
            return;
        }
        int x = s[i] - '0';
        if (dd[x] == 1)
            continue;
        dd[x] = 1;
        d++;
        if (d == 10)
        {
            printf("YES\n"); // Print result
            return;
        }
    }
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