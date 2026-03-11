/*
 * Filename: C03054.c
 * Description: C Program using functions: cut, solve
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

int cut(char x)
{
    if (x == '0' || x == '8' || x == '9')
        return 0;
    if (x == '1')
        return 1;
    return -1;
}

// Function to solve specific test case
void solve()
{
    char s[20];
    scanf("%s", s); // Read input
    long long res = 0;
    for (int i = 0; i < strlen(s); i++)
    {
        int x = cut(s[i]);
        if (x == -1)
        {
            printf("INVALID\n"); // Print result
            return;
        }
        res = res * 10 + x;
    }
    if (res == 0)
        printf("INVALID\n"); // Print result
    else
        printf("%lld\n", res); // Print result
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