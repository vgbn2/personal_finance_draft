/*
 * Filename: C07020.c
 * Description: Counts occurrences using functions: init, display
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

typedef struct Pokemon
{
    char species[100];
    int need, have, times;
} PKM;

void init(PKM p[], int i, int *count, int *max, int *pos)
{
    scanf("%s", p[i].species); // Read input
    scanf("%d %d", &p[i].need, &p[i].have); // Read input
    p[i].times = 0;
    while (p[i].have >= p[i].need)
    {
        p[i].times += p[i].have / p[i].need;
        p[i].have = p[i].have % p[i].need + 2 * (p[i].have / p[i].need);
    }
    if (p[i].times > *max)
    {
        *max = p[i].times;
        *pos = i;
    }
    *count += p[i].times;
}

void display(PKM p[], int count, int pos)
{
    printf("%d\n%s", count, p[pos].species); // Print result
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    PKM p[n];
    int count = 0, max = 0, pos = 0;
    for (int i = 0; i < n; i++)
        init(p, i, &count, &max, &pos);
    display(p, count, pos);
    return 0;
}