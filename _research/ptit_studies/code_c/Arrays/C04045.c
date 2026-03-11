/*
 * Filename: C04045.c
 * Description: Counts occurrences using functions: solve
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
    char s[1000];
    gets(s);
    int num = 0, count = 0, even = 0, odd = 0;
    for (int i = 0; i < strlen(s); i++)
    {
        if (s[i] != ' ')
            num = num * 10 + (s[i] - '0');
        else
        {
            count++;
            if (num % 2 == 0)
                even++;
            else
                odd++;
            num = 0;
        }
    }
    count++;
    if (num % 2 == 0)
        even++;
    else
        odd++;
    if ((count % 2 == 0 && even > odd) || (count % 2 == 1 && odd > even))
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