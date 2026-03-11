/*
 * Filename: C03048.c
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

bool check(char s[])
{
    int l = strlen(s);
    int even = 0, odd = 0;
    for (int i = 0; i < l; i++)
        if ((s[i] - '0') % 2 == 0)
            even++;
        else
            odd++;
    if ((s[l - 1] - '0') % 2 == 0 && even > odd)
        return 1;
    return 0;
}

// Function to solve specific test case
void solve()
{
    char s[20];
    scanf("%s", s); // Read input
    if (check(s))
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